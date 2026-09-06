// LabelIQ — Scan view: upload / camera / demo → preprocess → OCR w/ auto language
// detection → field normalization → rule engine → save scan

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import {
  Camera, FileImage, Languages, Loader2, RefreshCw, RotateCcw, RotateCw, Save, ScanLine,
  Sparkles, Trash2, Upload, Wand2, X, CheckCircle2, AlertTriangle, CircleDot, Bot,
} from 'lucide-react'
import type { ExtractedField, OcrLine, ScanDTO } from '@/lib/types'
import { CATEGORIES } from '@/lib/rules/repository'
import { mergeVlmFields, suggestCategory, type VlmFieldInput } from '@/lib/rules/extract'
import { FIELD_LABEL } from '@/lib/rules/synonyms'
import { DEFAULT_PREPROCESS, loadImage, processImage, type PreprocessOptions } from '@/lib/ocr/preprocess'
import { ocrPipeline, type OcrProgress, type OcrResult } from '@/lib/ocr/pipeline'
import { DEMO_SAMPLES, renderSampleImage, getSample } from '@/lib/samples'
import { ConfidenceBar, EvidenceOverlay, ScriptChips, SeverityBadge, StatusBadge } from './bits'

type Phase = 'source' | 'adjust' | 'running' | 'results'

/** response of POST /api/ai/extract */
interface VlmExtractResponse {
  fields: VlmFieldInput[]
  provider: string
  model: string
  attempts: number
  elapsedMs: number
  failoverFrom?: string
}

const LANG_OPTIONS: { value: string; label: string; langs: string[] }[] = [
  { value: 'auto', label: 'Auto-detect (recommended)', langs: [] },
  { value: 'eng', label: 'English', langs: ['eng'] },
  { value: 'hin+eng', label: 'Hindi + English', langs: ['hin', 'eng'] },
  { value: 'tam+eng', label: 'Tamil + English', langs: ['tam', 'eng'] },
  { value: 'tel+eng', label: 'Telugu + English', langs: ['tel', 'eng'] },
  { value: 'ben+eng', label: 'Bengali + English', langs: ['ben', 'eng'] },
  { value: 'guj+eng', label: 'Gujarati + English', langs: ['guj', 'eng'] },
  { value: 'kan+eng', label: 'Kannada + English', langs: ['kan', 'eng'] },
  { value: 'mal+eng', label: 'Malayalam + English', langs: ['mal', 'eng'] },
  { value: 'pan+eng', label: 'Punjabi + English', langs: ['pan', 'eng'] },
]

export function ScanView({ onSaved }: { onSaved: (scan: ScanDTO) => void }) {
  const [phase, setPhase] = useState<Phase>('source')
  const [imgUrl, setImgUrl] = useState<string | null>(null) // original dataURL
  const [fileName, setFileName] = useState('label.jpg')
  const [pre, setPre] = useState<PreprocessOptions>(DEFAULT_PREPROCESS)
  const [langChoice, setLangChoice] = useState('auto')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [result, setResult] = useState<OcrResult | null>(null)
  const [category, setCategory] = useState('General')
  const [categorySource, setCategorySource] = useState<'auto' | 'manual'>('manual')
  const [isEcomm, setIsEcomm] = useState(false)
  const [activeFieldIdx, setActiveFieldIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [ocrFields, setOcrFields] = useState<ExtractedField[] | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [demoId, setDemoId] = useState<string | null>(null)
  const [vlm, setVlm] = useState<VlmExtractResponse | null>(null)
  const [vlmBusy, setVlmBusy] = useState(false)

  // preview canvas refresh when preprocess options change
  useEffect(() => {
    if (!imgUrl || phase === 'running') return
    let cancelled = false
    loadImage(imgUrl)
      .then((img) => {
        if (cancelled) return
        const { displayUrl } = processImage(img, pre)
        setPreviewUrl(displayUrl)
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [imgUrl, pre, phase])

  const startFile = useCallback(async (file: File) => {
    setFileName(file.name || 'label.jpg')
    const url = await new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.readAsDataURL(file)
    })
    // downscale large photos
    const img = await loadImage(url)
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth * scale
    canvas.height = img.naturalHeight * scale
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    setImgUrl(canvas.toDataURL('image/jpeg', 0.85))
    setDemoMode(false)
    setDemoId(null)
    setPre(DEFAULT_PREPROCESS)
    setResult(null)
    setOcrFields(null)
    setPhase('adjust')
  }, [])

  const startDemo = useCallback((id: string) => {
    const sample = getSample(id)
    if (!sample) return
    const img = renderSampleImage(sample)
    setImgUrl(img)
    setFileName(`${sample.id}.jpg`)
    setDemoMode(true)
    setDemoId(id)
    setPre(DEFAULT_PREPROCESS)
    setResult(null)
    setOcrFields(null)
    // demo samples carry their intended classification (e.g. e-commerce listing)
    setCategory(sample.category)
    setCategorySource('manual')
    setIsEcomm(sample.isEcommerce)
    setPhase('adjust')
  }, [])

  // camera
  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
      streamRef.current = stream
      setCameraOn(true)
      setPhase('source')
    } catch {
      toast.error('Camera unavailable — use upload or demo labels')
    }
  }, [])

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => undefined)
    }
  }, [cameraOn])

  const capture = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0)
    setImgUrl(canvas.toDataURL('image/jpeg', 0.85))
    setFileName(`capture-${Date.now()}.jpg`)
    setDemoMode(false)
    setDemoId(null)
    setResult(null)
    setOcrFields(null)
    setPre(DEFAULT_PREPROCESS)
    // stop camera
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
    setPhase('adjust')
  }, [])

  const runOcr = useCallback(async () => {
    if (!imgUrl) return
    setPhase('running')
    setProgress({ stage: 'preprocess', progress: 0.05, detail: 'Preparing' })
    try {
      const img = await loadImage(imgUrl)
      if (demoMode && demoId) {
        // demo mode: canned OCR, full downstream pipeline
        const sample = getSample(demoId)!
        await new Promise((r) => setTimeout(r, 900)) // let the progress bar breathe
        setResult({
          ocrText: sample.ocr.lines.map((l) => l.text).join('\n'),
          lines: sample.ocr.lines,
          language: sample.ocr.language,
          processedDataUrl: imgUrl,
          displayDataUrl: imgUrl,
        })
      } else {
        const manual = LANG_OPTIONS.find((o) => o.value === langChoice)?.langs
        const res = await ocrPipeline(img, pre, {
          manualLangs: manual && manual.length ? manual : undefined,
          onProgress: setProgress,
        })
        setResult(res)
      }
      setPhase('results')
    } catch (e) {
      console.error(e)
      toast.error('OCR failed — check your connection (language packs load from CDN) or use a demo label')
      setPhase('adjust')
    }
  }, [imgUrl, demoMode, demoId, langChoice, pre])

  // auto-suggest category once results arrive (skipped for demo samples — they carry intent)
  useEffect(() => {
    if (phase === 'results' && result && !demoMode) {
      const s = suggestCategory(result.ocrText)
      if (s.source === 'auto') {
        setCategory(s.category)
        setCategorySource('auto')
        setIsEcomm(s.category === 'E-commerce Listing')
      }
    }
  }, [phase, result])

  const boxes = useMemo(() => {
    if (!result || !ocrFields) return []
    return ocrFields
      .map((f) => ({ bbox: f.bbox, color: f.value ? '#2DD4BF' : '#FBBF24' }))
      .filter((b): b is { bbox: NonNullable<ExtractedField['bbox']>; color: string } => b.bbox != null)
  }, [result, ocrFields])

  // AI fallback is offered when the deterministic pass left gaps or ran on weak OCR
  const meanOcrConf = useMemo(() => {
    if (!result?.lines.length) return 1
    return result.lines.reduce((s, l) => s + l.confidence, 0) / result.lines.length
  }, [result])
  const needsAi = useMemo(
    () =>
      phase === 'results' &&
      !!result &&
      !demoMode &&
      ((ocrFields?.some((f) => f.value === null) ?? true) || meanOcrConf < 0.75),
    [phase, result, demoMode, ocrFields, meanOcrConf],
  )

  const runVlm = useCallback(async () => {
    if (!result || vlmBusy) return
    setVlmBusy(true)
    try {
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageData: result.displayDataUrl, ocrText: result.ocrText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(String(json.error ?? 'AI extraction failed'))
      const data = json as VlmExtractResponse
      setVlm(data)
      setOcrFields((prev) => (prev ? mergeVlmFields(prev, data.fields) : prev))
      const filled = data.fields.length
      toast.success(`AI fallback: ${filled} field${filled === 1 ? '' : 's'} read by ${data.provider}${data.failoverFrom ? ` (after ${data.failoverFrom} failed)` : ''}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI fallback failed')
    } finally {
      setVlmBusy(false)
    }
  }, [result, vlmBusy])

  const saveScan = useCallback(async () => {
    if (!result) return
    setSaving(true)
    try {
      // compute fields locally for preview (server recomputes authoritative)
      const fields = ocrFields ?? []
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName,
          imageData: result.displayDataUrl,
          ocrText: result.ocrText,
          lines: result.lines,
          language: result.language,
          category: isEcomm && category !== 'E-commerce Listing' ? 'E-commerce Listing' : category,
          categorySource,
          isEcommerce: isEcomm,
          fields, // client preview only
          vlmFields: vlm?.fields, // AI fallback reads (server re-validates + merges)
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      toast.success('Scan saved — findings generated by the rule engine')
      onSaved(json.scan as ScanDTO)
      // reset
      setPhase('source')
      setImgUrl(null)
      setResult(null)
      setOcrFields(null)
      setPreviewUrl(null)
      setVlm(null)
    } catch (e) {
      console.error(e)
      toast.error('Failed to save scan')
    } finally {
      setSaving(false)
    }
  }, [result, fileName, category, categorySource, isEcomm, onSaved, ocrFields, vlm])

  // compute fields for display when results change
  useEffect(() => {
    if (result) {
      import('@/lib/rules/extract').then(({ extractFields }) => {
        setOcrFields(extractFields(result.lines))
      })
    } else {
      setOcrFields(null)
    }
  }, [result])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Scan a package label</h2>
          <p className="text-sm text-muted-foreground">
            Image → preprocessing → multilingual OCR → field normalization → versioned rule engine → evidence-backed findings
          </p>
        </div>
        <PipelineChips phase={phase} demo={demoMode} />
      </header>

      {cameraOn && (
        <Card className="border-teal-500/30">
          <CardContent className="flex flex-col items-center gap-3 py-6">
            <video ref={videoRef} playsInline muted className="max-h-72 rounded-md border border-border" />
            <div className="flex gap-2">
              <Button onClick={capture}><Camera className="mr-2 h-4 w-4" /> Capture</Button>
              <Button
                variant="outline"
                onClick={() => {
                  streamRef.current?.getTracks().forEach((t) => t.stop())
                  streamRef.current = null
                  setCameraOn(false)
                }}
              >
                <X className="mr-2 h-4 w-4" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'source' && !cameraOn && (
        <SourceStep
          onFile={startFile}
          onCamera={openCamera}
          onDemo={startDemo}
          fileRef={fileRef}
        />
      )}

      {phase === 'adjust' && imgUrl && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-teal-300" /> Preprocessing — OpenCV-style layer</span>
                {demoMode && <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">DEMO LABEL</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center">
              {previewUrl && (
                 
                <img src={previewUrl} alt="Preprocessed label preview" className="max-h-[440px] rounded-md border border-border" />
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Image adjustments</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPre((p) => ({ ...p, rotation: p.rotation - 90 }))}><RotateCcw className="h-4 w-4" /></Button>
                  <span className="text-xs text-muted-foreground">rotate {((pre.rotation % 360) + 360) % 360}°</span>
                  <Button size="sm" variant="outline" onClick={() => setPre((p) => ({ ...p, rotation: p.rotation + 90 }))}><RotateCw className="h-4 w-4" /></Button>
                </div>
                <div>
                  <Label className="text-xs">Contrast {pre.contrast > 0 ? '+' : ''}{pre.contrast}</Label>
                  <Slider value={[pre.contrast]} min={-60} max={80} step={5} onValueChange={([v]) => setPre((p) => ({ ...p, contrast: v }))} />
                </div>
                <div>
                  <Label className="text-xs">Brightness {pre.brightness > 0 ? '+' : ''}{pre.brightness}</Label>
                  <Slider value={[pre.brightness]} min={-60} max={60} step={5} onValueChange={([v]) => setPre((p) => ({ ...p, brightness: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Grayscale</Label>
                  <Switch checked={pre.grayscale} onCheckedChange={(v) => setPre((p) => ({ ...p, grayscale: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Otsu binarize</Label>
                  <Switch checked={pre.binarize} onCheckedChange={(v) => setPre((p) => ({ ...p, binarize: v }))} />
                </div>
                <div>
                  <Label className="text-xs">Upscale ×{pre.scale.toFixed(1)}</Label>
                  <Slider value={[pre.scale]} min={1} max={2.5} step={0.25} onValueChange={([v]) => setPre((p) => ({ ...p, scale: v }))} />
                </div>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setPre(DEFAULT_PREPROCESS)}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Reset
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Languages className="h-4 w-4 text-teal-300" /> OCR language</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Select value={langChoice} onValueChange={setLangChoice}>
                  <SelectTrigger className="w-full" aria-label="OCR language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANG_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.value === 'auto' ? <><Sparkles className="mr-1 inline h-3.5 w-3.5 text-teal-300" />{o.label}</> : o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="w-full" onClick={runOcr}>
                  <ScanLine className="mr-2 h-4 w-4" /> Run OCR pipeline
                </Button>
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setImgUrl(null); setPhase('source') }}>
                  <Trash2 className="mr-1 h-3 w-3" /> Discard image
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-teal-300" />
            <div className="w-72">
              <Progress value={(progress?.progress ?? 0.05) * 100} />
            </div>
            <p className="text-sm text-muted-foreground">
              {progress?.stage === 'preprocess' && 'Preprocessing image (grayscale · contrast · geometry)'}
              {progress?.stage === 'detect' && (progress?.detail ?? 'Detecting script (OSD)')}
              {progress?.stage === 'recognize' && (progress?.detail ?? 'Recognizing text')}
              {progress?.stage === 'normalize' && 'Mapping bounding boxes & confidence'}
              {progress?.stage === 'done' && (progress?.detail ?? 'Done')}
              {!progress && 'Starting…'}
            </p>
          </CardContent>
        </Card>
      )}

      {phase === 'results' && result && (
        <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
          {/* left: evidence + OCR text */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Evidence — bounding boxes</span>
                  {activeFieldIdx != null && ocrFields?.[activeFieldIdx] && (
                    <span className="font-mono text-xs text-teal-300">{FIELD_LABEL[ocrFields[activeFieldIdx].field]}</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center">
                {boxes.length > 0 ? (
                  <EvidenceOverlay
                    imageData={result.displayDataUrl}
                    boxes={boxes}
                    activeIdx={activeFieldIdx}
                    onSelect={setActiveFieldIdx}
                  />
                ) : (
                   
                  <img src={result.displayDataUrl} alt="Scanned label" className="max-h-[420px] rounded-md border border-border" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Raw OCR text</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-40 rounded-md border border-border bg-black/20 p-3">
                  <pre className="font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">{result.ocrText || '(no text recognized)'}</pre>
                </ScrollArea>
                <p className="mt-2 text-[11px] text-muted-foreground">{result.lines.length} lines · mean confidence {Math.round((result.lines.reduce((s, l) => s + l.confidence, 0) / Math.max(1, result.lines.length)) * 100)}%</p>
              </CardContent>
            </Card>
          </div>

          {/* right: language + fields + save */}
          <div className="space-y-4">
            <Card className="border-teal-500/25">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Languages className="h-4 w-4 text-teal-300" /> Automatic language detection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-lg font-semibold">{result.language.scriptLabel}</div>
                <ScriptChips ratios={result.language.ratios} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>method: <span className="font-mono text-teal-300">{result.language.method}</span></span>
                  <span>OCR langs: <span className="font-mono text-teal-300">{result.language.ocrLangs.join('+')}</span></span>
                  <span>conf: <span className="font-mono">{Math.round(result.language.confidence * 100)}%</span></span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Classification</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Select value={category} onValueChange={(v) => { setCategory(v); setCategorySource('manual'); setIsEcomm(v === 'E-commerce Listing') }}>
                    <SelectTrigger className="flex-1" aria-label="Category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {categorySource === 'auto' && (
                    <span className="flex items-center gap-1 rounded-md bg-teal-500/15 px-2 py-1 text-[10px] font-semibold text-teal-300"><Sparkles className="h-3 w-3" /> AUTO</span>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">E-commerce listing</div>
                    <div className="text-[11px] text-muted-foreground">Enables 2026 1st-Amdt origin rules</div>
                  </div>
                  <Switch checked={isEcomm} onCheckedChange={setIsEcomm} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Normalized fields</span>
                  {(needsAi || vlm) && (
                    <span className="flex items-center gap-2">
                      {vlm && !vlmBusy && (
                        <span className="font-mono text-[10px] text-teal-300/80">
                          {vlm.provider} · {vlm.model} · {vlm.attempts} attempt{vlm.attempts > 1 ? 's' : ''}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-teal-500/40 px-2 text-[11px] text-teal-300 hover:bg-teal-500/10"
                        onClick={runVlm}
                        disabled={vlmBusy}
                        title="Ask the vision model to read fields the OCR pass missed"
                      >
                        {vlmBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Bot className="mr-1 h-3 w-3" />}
                        {vlmBusy ? 'Reading label…' : vlm ? 'Re-run AI' : 'AI fallback'}
                      </Button>
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ocrFields && ocrFields.length > 0 ? (
                  <div className="space-y-1.5">
                    {ocrFields.map((f, i) => (
                      <button
                        key={`${f.field}-${i}`}
                        type="button"
                        onMouseEnter={() => setActiveFieldIdx(i)}
                        onClick={() => setActiveFieldIdx(i)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-left transition-colors hover:border-teal-500/40 hover:bg-teal-500/5"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{FIELD_LABEL[f.field]}</span>
                            {f.source === 'ai' && (
                              <span className="flex items-center gap-0.5 rounded bg-teal-500/15 px-1 py-px text-[9px] font-bold text-teal-300">
                                <Bot className="h-2.5 w-2.5" />AI
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-sm font-medium">{f.value ?? <span className="text-amber-300">value not parsed</span>}</span>
                        </span>
                        <ConfidenceBar value={f.confidence} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No known fields matched — check OCR quality or language.</p>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={saveScan} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save & run rule engine
              </Button>
              <Button variant="outline" onClick={runOcr}><RefreshCw className="mr-2 h-4 w-4" /> Re-run</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PipelineChips({ phase, demo }: { phase: Phase; demo: boolean }) {
  const steps = [
    { k: 'source', label: 'Source' },
    { k: 'adjust', label: 'Preprocess' },
    { k: 'running', label: 'OCR + Detect' },
    { k: 'results', label: 'Fields + Rules' },
  ]
  const order: Record<Phase, number> = { source: 0, adjust: 1, running: 2, results: 3 }
  return (
    <div className="flex items-center gap-1.5">
      {demo && <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">DEMO</span>}
      {steps.map((s, i) => (
        <span key={s.k} className={i > 0 ? 'text-muted-foreground' : ''}>
          {i > 0 && <span className="mx-1 text-muted-foreground/50">→</span>}
          <span className={cnChip(order[phase] >= i)}>{s.label}</span>
        </span>
      ))}
    </div>
  )
}

function cnChip(active: boolean) {
  return `rounded-full px-2.5 py-1 text-[11px] font-medium ${active ? 'bg-teal-500/15 text-teal-300' : 'bg-slate-500/10 text-muted-foreground'}`
}

function SourceStep({ onFile, onCamera, onDemo, fileRef }: {
  onFile: (f: File) => void
  onCamera: () => void
  onDemo: (id: string) => void
  fileRef: React.RefObject<HTMLInputElement | null>
}) {
  const [drag, setDrag] = useState(false)
  return (
    <div className="space-y-4">
      <Card
        className={`border-dashed transition-colors ${drag ? 'border-teal-400 bg-teal-500/5' : 'border-border'}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files?.[0]
          if (f && f.type.startsWith('image/')) onFile(f)
          else toast.error('Drop an image file (JPG/PNG/WebP)')
        }}
      >
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="rounded-full border border-teal-500/30 bg-teal-500/10 p-4">
            <FileImage className="h-8 w-8 text-teal-300" />
          </div>
          <div>
            <p className="text-base font-medium">Drop a package photo here</p>
            <p className="text-sm text-muted-foreground">JPG / PNG / WebP · tilt, glare and low contrast handled by the preprocessing layer</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Upload image</Button>
            <Button variant="outline" onClick={onCamera}><Camera className="mr-2 h-4 w-4" /> Use camera</Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4 text-teal-300" /> Judge-safe demo labels (canned OCR, real pipeline)
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {DEMO_SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onDemo(s.id)}
              className="group rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-teal-500/40 hover:bg-teal-500/5"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                {s.expected.startsWith('COMPLIANT') ? <CheckCircle2 className="h-4 w-4 text-teal-300" /> : s.expected.startsWith('PENDING') ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : <CircleDot className="h-4 w-4 text-amber-300" />}
                <span className="text-sm font-semibold group-hover:text-teal-200">{s.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.story}</p>
              <p className="mt-2 font-mono text-[10px] text-teal-300/80">{s.expected}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
