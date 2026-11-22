'use client'
import { createAuthClient } from 'better-auth/react'
import { removePushSubscription } from '@/app/actions/notifications'
export const authClient = createAuthClient()
export const { signIn, signUp, signOut, useSession } = authClient

export async function signOutCurrentDevice() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    const subscription = await registration?.pushManager?.getSubscription()
    if (subscription) {
      await Promise.allSettled([removePushSubscription(subscription.endpoint), subscription.unsubscribe()])
    }
  } catch {
    // A service worker failure must not leave the user signed in.
  }

  const result = await authClient.signOut()
  if (result.error) throw new Error('Could not sign out. Try again.')
}
