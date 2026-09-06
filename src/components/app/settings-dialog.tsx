// LabelIQ — Settings dialog: AI provider status + BYOK key vault.
//
// Two tabs:
//   AI status    — live /api/health readout (which providers serve the app,
//                  which version is deployed)
//   My keys      — bring-your-own-key vault: Z.ai / NIM keys + models,
//                  encrypted with AES-256-GCM on this device (passphrase).
//                  Unlocked keys ride along on /api/ai/extract requests and
//                  take priority over server keys for that call.

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Bot, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, LockOpen, Settings, Trash2 } from 'lucide-react'
import { APP_VERSION, BUILD_DATE, FEATURES } from '@/lib/version'
import {
  byokHeaders, lockVault, saveVault, unlockVault, vaultStatus, wipeVault,
  type VaultStatus,
} from '@/lib/vault/vault'

interface HealthResponse {
  ok: boolean
  version: string
  buildDate: string
  ai: { live: boolean; providers: { id: string; label: string; model: string }[]; byokSupported: boolean }
  db: { engine: string; scans: number | null }
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // AI status tab
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthBusy, setHealthBusy] = useState(false)

  // vault tab
  const [status, setStatus] = useState<VaultStatus>({ exists: false, unlocked: false, hint: null, savedAt: null })
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [zaiKey, setZaiKey] = useState('')
  const [zaiModel, setZaiModel] = useState('')
  const [nimKey, setNimKey] = useState('')
  const [nimModel, setNimModel] = useState('')
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const refreshStatus = useCallback(() => setStatus(vaultStatus()), [])

  const loadHealth = useCallback(async () => {
    setHealthBusy(true)
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      setHealth(await res.json())
    } catch {
      setHealth(null)
    } finally {
      setHealthBusy(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      refreshStatus()
      loadHealth()
    }
  }, [open, refreshStatus, loadHealth])

  const onSave = useCallback(async () => {
    if (pass.length < 6) {
      toast.error('Passphrase must be at least 6 characters')
      return
    }
    if (!zaiKey.trim() && !nimKey.trim()) {
      toast.error('Enter at least one API key (Z.ai or NIM)')
      return
    }
    setBusy('save')
    try {
      const ok = await saveVault(
        pass,
        {
          zaiKey: zaiKey.trim() || undefined,
          zaiModel: zaiModel.trim() || undefined,
          nimKey: nimKey.trim() || undefined,
          nimModel: nimModel.trim() || undefined,
        },
        hint.trim() || 'my keys',
      )
      if (!ok) throw new Error('encrypt failed')
      toast.success('Keys encrypted and saved on this device — unlocked for this session')
      setPass('')
      refreshStatus()
    } catch {
      toast.error('Could not save the vault')
    } finally {
      setBusy(null)
    }
  }, [pass, zaiKey, zaiModel, nimKey, nimModel, hint, refreshStatus])

  const onUnlock = useCallback(async () => {
    setBusy('unlock')
    try {
      const ok = await unlockVault(pass)
      if (!ok) {
        toast.error('Wrong passphrase (or the vault is unreadable)')
      } else {
        toast.success('Vault unlocked — your keys will be used for AI extraction')
        setPass('')
        refreshStatus()
      }
    } finally {
      setBusy(null)
    }
  }, [pass, refreshStatus])

  const activeByok = Object.keys(byokHeaders()).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-teal-300" /> Settings
            <Badge variant="outline" className="ml-1 border-teal-500/30 font-mono text-[10px] text-teal-300/90">
              v{APP_VERSION}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            AI providers, deployment status and your own encrypted API keys
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="status">
          <TabsList className="w-full">
            <TabsTrigger value="status" className="flex-1">AI status</TabsTrigger>
            <TabsTrigger value="keys" className="flex-1">My keys</TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="space-y-3 pt-1">
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deployment</span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={loadHealth} disabled={healthBusy}>
                  {healthBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Refresh
                </Button>
              </div>
              {health ? (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono text-teal-300">v{health.version} · {health.buildDate}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Scans in DB</span>
                    <span className="font-mono">{health.db.scans ?? '—'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">health endpoint unreachable</p>
              )}
            </div>

            <div className="rounded-md border border-border p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI providers (server)</span>
              <div className="mt-2 space-y-1.5">
                {health?.ai.providers.length ? (
                  health.ai.providers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-teal-300" /> {p.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{p.model}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-amber-300">No server keys configured — use your own keys in “My keys”</p>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {FEATURES.aiFallback}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="keys" className="space-y-3 pt-1">
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-teal-300" />
              <span className="font-medium">Bring your own keys</span>
              <span className="ml-auto flex items-center gap-1.5">
                {status.unlocked ? (
                  <Badge className="gap-1 border-teal-500/40 bg-teal-500/15 text-[10px] text-teal-300 hover:bg-teal-500/15">
                    <LockOpen className="h-3 w-3" /> unlocked
                  </Badge>
                ) : status.exists ? (
                  <Badge variant="outline" className="gap-1 border-amber-500/40 text-[10px] text-amber-300">
                    <Lock className="h-3 w-3" /> locked
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">empty</Badge>
                )}
                {activeByok && (
                  <Badge className="gap-1 border-teal-500/40 bg-teal-500/15 text-[10px] text-teal-300 hover:bg-teal-500/15">
                    <Bot className="h-3 w-3" /> in use
                  </Badge>
                )}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Keys are encrypted with AES-256-GCM on this device and only decrypted in memory after you enter the
              passphrase. They are attached per-request to AI calls and never stored server-side.
            </p>

            <div className="space-y-2">
              <div className="grid gap-2">
                <div className="grid grid-cols-[1fr_150px] gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="zai-key">Z.ai API key</Label>
                    <Input id="zai-key" value={zaiKey} onChange={(e) => setZaiKey(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="zai-model">Model</Label>
                    <Input id="zai-model" value={zaiModel} onChange={(e) => setZaiModel(e.target.value)} placeholder="glm-4.6v-flash" />
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_150px] gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="nim-key">NVIDIA NIM key (optional)</Label>
                    <Input id="nim-key" value={nimKey} onChange={(e) => setNimKey(e.target.value)} placeholder="nvapi-…" autoComplete="off" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="nim-model">Model</Label>
                    <Input id="nim-model" value={nimModel} onChange={(e) => setNimModel(e.target.value)} placeholder="meta/…" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="hint">Passphrase reminder (not secret)</Label>
                  <Input id="hint" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="e.g. my sih keys" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Label className="sr-only" htmlFor="pass">Vault passphrase</Label>
                <Input
                  id="pass"
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder={status.exists ? 'Passphrase to unlock / re-save' : 'Choose a passphrase (min 6 chars)'}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onSave} disabled={!!busy}>
                {busy === 'save' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1 h-3.5 w-3.5" />}
                Save &amp; unlock
              </Button>
              <Button size="sm" variant="outline" onClick={onUnlock} disabled={!!busy || !status.exists || !pass}>
                {busy === 'unlock' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <LockOpen className="mr-1 h-3.5 w-3.5" />}
                Unlock
              </Button>
              <Button size="sm" variant="outline" onClick={() => { lockVault(); refreshStatus() }} disabled={!status.unlocked}>
                <Lock className="mr-1 h-3.5 w-3.5" /> Lock
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-300 hover:bg-red-500/10"
                onClick={() => { wipeVault(); refreshStatus(); setZaiKey(''); setNimKey('') }}
                disabled={!status.exists}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Wipe
              </Button>
            </div>

            {status.hint && (
              <p className="text-[11px] text-muted-foreground">
                Vault hint: <span className="font-mono text-teal-300/80">{status.hint}</span>
                {status.savedAt && <> · saved {new Date(status.savedAt).toLocaleString()}</>}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
