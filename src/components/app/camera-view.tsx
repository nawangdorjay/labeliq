// LabelIQ — Camera v2: live capture tuned for label scanning.
//
// getUserMedia preview with:
//   - torch (flashlight) toggle when the sensor supports it
//   - front / back camera switching
//   - zoom slider (optical + digital, when exposed via track capabilities)
//   - tap-to-focus (pointsOfInterest) with an AF ring animation
//   - guidance frame overlay ("align the label inside the brackets")
//   - high-quality JPEG capture (1920 ideal, q=0.92 — OCR benefits)
//   - graceful fallback to <input capture="environment"> when getUserMedia
//     is denied or unavailable (e.g. desktop without a webcam)

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { Camera, FlashlightOff, Flashlight, Focus, SwitchCamera, X, Upload } from 'lucide-react'

/** capabilities MediaStreamTrack.getCapabilities() may not declare in TS lib */
interface TrackCaps {
  torch?: boolean
  zoom?: { min: number; max: number; step?: number }
  focusMode?: string[]
}

interface Props {
  onCapture: (dataUrl: string) => void
  onCancel: () => void
}

export function CameraView({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const [focusSupported, setFocusSupported] = useState(false)
  const [afPoint, setAfPoint] = useState<{ x: number; y: number; id: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setReady(false)
    setTorchOn(false)
    setTorchSupported(false)
    setZoomCaps(null)
    setZoom(null)
    setFocusSupported(false)
  }, [])

  const open = useCallback(
    async (mode: 'environment' | 'user') => {
      setBusy(true)
      setError(null)
      stopStream()
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        const caps = (track?.getCapabilities?.() ?? {}) as TrackCaps
        setTorchSupported(!!caps.torch)
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          const step = caps.zoom.step && caps.zoom.step > 0 ? caps.zoom.step : 0.1
          setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step })
          setZoom(track?.getSettings?.().zoom ?? caps.zoom.min)
        }
        setFocusSupported(!!caps.focusMode?.length)
        setFacing(mode)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => undefined)
        }
        setReady(true)
      } catch (e) {
        const name = e instanceof Error ? e.name : ''
        const msg =
          name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow access in your browser, or use the fallback below.'
            : name === 'NotFoundError'
              ? 'No camera found on this device. Use the fallback below.'
              : 'Camera could not start. Use the fallback below.'
        setError(msg)
      } finally {
        setBusy(false)
      }
    },
    [stopStream],
  )

  // open the camera on mount, clean up on unmount
  useEffect(() => {
    open('environment')
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || !torchSupported) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints)
      setTorchOn((v) => !v)
    } catch {
      toast.error('Torch toggle failed on this device')
    }
  }, [torchOn, torchSupported])

  const applyZoom = useCallback(async (v: number) => {
    setZoom(v)
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: v }] } as unknown as MediaTrackConstraints)
    } catch {
      /* some drivers reject redundant zoom values — non-fatal */
    }
  }, [])

  const switchCamera = useCallback(() => {
    open(facing === 'environment' ? 'user' : 'environment')
  }, [facing, open])

  const tapFocus = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!focusSupported) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
      setAfPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() })
      setTimeout(() => setAfPoint(null), 900)
      const track = streamRef.current?.getVideoTracks()[0]
      if (!track) return
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }],
        } as unknown as MediaTrackConstraints)
      } catch {
        /* focus AF not honored — the visual hint still helps the user aim */
      }
    },
    [focusSupported],
  )

  const capture = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')!
    if (facing === 'user') {
      // un-mirror for accuracy (preview shows a mirror; evidence must not)
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    stopStream()
    onCapture(dataUrl)
  }, [facing, onCapture, stopStream])

  const close = useCallback(() => {
    stopStream()
    onCancel()
  }, [onCancel, stopStream])

  return (
    <div className="overflow-hidden rounded-xl border border-teal-500/30 bg-black">
      <div className="flex items-center justify-between border-b border-teal-500/20 bg-card/90 px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-teal-200">
          <Camera className="h-3.5 w-3.5" /> Camera capture
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {ready ? `${facing === 'environment' ? 'back' : 'front'} camera · ${videoRef.current?.videoWidth ?? 0}×${videoRef.current?.videoHeight ?? 0}` : busy ? 'starting…' : 'offline'}
        </span>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-4 bg-black/40 px-6 py-10 text-center">
          <p className="max-w-sm text-sm text-amber-200">{error}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => open(facing)}>
              <Camera className="mr-1 h-3.5 w-3.5" /> Retry camera
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-3.5 w-3.5" /> Use system camera
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const r = new FileReader()
              r.onload = () => {
                close()
                onCapture(String(r.result))
              }
              r.readAsDataURL(f)
              e.target.value = ''
            }}
          />
        </div>
      ) : (
        <>
          {/* viewfinder */}
          <div
            className="relative aspect-[4/3] w-full select-none overflow-hidden bg-black"
            onClick={tapFocus}
            role="presentation"
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`h-full w-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
            />

            {/* guidance frame */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[78%] w-[86%]">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-[3px] border-t-[3px] border-teal-300/80" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-[3px] border-t-[3px] border-teal-300/80" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-[3px] border-l-[3px] border-teal-300/80" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-[3px] border-r-[3px] border-teal-300/80" />
              </div>
            </div>
            <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px] font-medium tracking-wide text-teal-200/90 drop-shadow">
              Align the label inside the frame · hold steady · avoid glare
            </p>

            {/* AF ring */}
            {afPoint && (
              <span
                key={afPoint.id}
                className="pointer-events-none absolute h-10 w-10 animate-ping rounded-full border-2 border-teal-300"
                style={{ left: afPoint.x - 20, top: afPoint.y - 20 }}
              />
            )}

            {!ready && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span className="text-xs text-muted-foreground">starting camera…</span>
              </div>
            )}
          </div>

          {/* controls */}
          <div className="space-y-2 border-t border-teal-500/20 bg-card/90 px-3 py-3">
            {zoomCaps && (
              <div className="flex items-center gap-3 px-1">
                <Focus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Slider
                  value={[zoom ?? zoomCaps.min]}
                  min={zoomCaps.min}
                  max={zoomCaps.max}
                  step={zoomCaps.step}
                  onValueChange={([v]) => applyZoom(v)}
                  aria-label="Camera zoom"
                />
                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                  {zoom != null ? `${zoom.toFixed(1)}×` : '—'}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0"
                onClick={toggleTorch}
                disabled={!torchSupported}
                title={torchSupported ? (torchOn ? 'Turn torch off' : 'Turn torch on') : 'Torch not supported on this device'}
                aria-label="Toggle torch"
              >
                {torchOn ? <Flashlight className="h-4 w-4 text-amber-300" /> : <FlashlightOff className="h-4 w-4" />}
              </Button>

              <button
                type="button"
                onClick={capture}
                disabled={!ready}
                className="group flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-teal-300/80 bg-teal-500/15 transition-all hover:bg-teal-500/30 active:scale-95 disabled:opacity-40"
                aria-label="Capture photo"
                title="Capture the label"
              >
                <span className="h-11 w-11 rounded-full bg-teal-300/90 transition-colors group-hover:bg-teal-200" />
              </button>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0"
                  onClick={switchCamera}
                  disabled={busy}
                  title="Switch front / back camera"
                  aria-label="Switch camera"
                >
                  <SwitchCamera className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 p-0"
                  onClick={close}
                  title="Close camera"
                  aria-label="Close camera"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="px-1 text-center text-[10px] text-muted-foreground">
              {focusSupported ? 'Tap the viewfinder to focus · ' : ''}
              {torchSupported ? 'torch available · ' : ''}
              captured at JPEG q=0.92 for OCR
            </p>
          </div>
        </>
      )}
    </div>
  )
}
