'use server'

export async function subscribe(_prev: string, form: FormData) {
  const email = String(form.get('email') ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email doesn’t look right. Check it and try again.'
  return 'You’re on the Orch dispatch list. The next research & release issue ships Friday.'
}
