import { type Phase } from './config'

let audioContext: AudioContext | null = null

/**
 * Create the AudioContext during a user gesture. Browsers start one created
 * outside a gesture in the "suspended" state, which would silence the beep.
 */
export function primeAudio(): void {
  try {
    audioContext ??= new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch (error) {
    console.error('[alerts] could not initialise audio', error)
  }
}

/** Short synthesized tone — no audio file. */
export function beep(): void {
  try {
    primeAudio()
    const ctx = audioContext
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, start)

    // Ramp in and out; a raw square-edged gain change clicks audibly.
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.36)
  } catch (error) {
    console.error('[alerts] beep failed', error)
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * Ask once, on a user gesture. Browsers reject (and some penalise) permission
 * prompts triggered on page load.
 */
export function requestNotificationPermission(): void {
  if (!notificationsSupported()) return
  if (Notification.permission !== 'default') return

  try {
    void Notification.requestPermission()
  } catch (error) {
    console.error('[alerts] notification permission request failed', error)
  }
}

const MESSAGES: Record<Phase, string> = {
  work: 'Focus session complete — break time',
  shortBreak: "Break's over — back to focus",
  longBreak: "Long break's over — back to focus",
}

/** Message describing what just ended and what is starting now. */
export function completionMessage(finished: Phase): string {
  return MESSAGES[finished]
}

export function notify(finished: Phase): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return

  try {
    new Notification('Pomme', { body: completionMessage(finished) })
  } catch (error) {
    console.error('[alerts] notification failed', error)
  }
}
