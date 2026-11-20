'use server'

import { revalidatePath } from 'next/cache'
import { redirect, RedirectType } from 'next/navigation'

export async function enterDashboard() {
  revalidatePath('/', 'layout')
  redirect('/', RedirectType.replace)
}
