// LabelIQ — AI access password dialog.
//
// Shown when a user without their own API key (no BYOK vault unlocked)
// presses "AI extract": using the project's shared server key requires the
// access password. A correct password unlocks the shared key for the whole
// active browsing session (survives reloads, cleared when the site is
// closed).

'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Loader2, Lock, ShieldCheck } from 'lucide-react'
import { unlockServerAi } from '@/lib/vault/ai-access'

export function AiPassDialog({
  open,
  onOpenChange,
  onUnlocked,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** called with the fresh token after a successful unlock */
  onUnlocked: (token: string) => void
}) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      // focus the field when the dialog appears (async → allowed in effect)
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  const submit = async () => {
    if (!pw.trim() || busy) return
    setBusy(true)
    setErr(null)
    const { token, error } = await unlockServerAi(pw)
    setBusy(false)
    if (!token) {
      setErr(error ?? 'Wrong password')
      setPw('')
      inputRef.current?.focus()
      return
    }
    setPw('')
    onUnlocked(token)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v) }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-md border border-teal-500/30 bg-teal-500/10 p-1.5">
              <Lock className="h-4 w-4 text-teal-300" />
            </span>
            Unlock AI extraction
          </DialogTitle>
          <DialogDescription>
            The AI reader can use this project&apos;s shared API key. Enter the access
            password to unlock it — once per session, no re-ask until you close the site.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            ref={inputRef}
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Access password"
            autoComplete="off"
            aria-label="AI access password"
            disabled={busy}
          />

          {err && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {err}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-teal-300/70" />
              Your password unlocks locally and is verified server-side; the shared
              API key itself never leaves the server.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!pw.trim() || busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              {busy ? 'Checking…' : 'Unlock'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
