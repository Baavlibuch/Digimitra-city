"use client"

import { Amplify } from "aws-amplify"
import {
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
} from "aws-amplify/auth"

type CognitoUser = {
  userId: string
  username: string
  email?: string
}

let configured = false

function getCognitoConfig() {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  const region = process.env.NEXT_PUBLIC_AWS_REGION ?? process.env.NEXT_PUBLIC_COGNITO_REGION

  if (!userPoolId || !userPoolClientId || !region) {
    throw new Error("Cognito environment variables are missing.")
  }

  return {
    userPoolId,
    userPoolClientId,
    region,
  }
}

export function configureCognito() {
  if (configured) return
  const { userPoolId, userPoolClientId, region } = getCognitoConfig()
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  })
  configured = true
  if (typeof document !== "undefined") {
    document.cookie = `dm_region=${encodeURIComponent(region)}; path=/; SameSite=Lax`
  }
}

export async function signInWithEmail(email: string, password: string) {
  configureCognito()
  return signIn({
    username: email.trim().toLowerCase(),
    password,
  })
}

export async function signUpWithEmail(params: { fullName: string; email: string; password: string }) {
  configureCognito()
  return signUp({
    username: params.email.trim().toLowerCase(),
    password: params.password,
    options: {
      userAttributes: {
        email: params.email.trim().toLowerCase(),
        name: params.fullName.trim(),
      },
    },
  })
}

export async function confirmEmailSignUp(email: string, code: string) {
  configureCognito()
  return confirmSignUp({
    username: email.trim().toLowerCase(),
    confirmationCode: code.trim(),
  })
}

export async function resendVerificationCode(email: string) {
  configureCognito()
  return resendSignUpCode({
    username: email.trim().toLowerCase(),
  })
}

export async function getAuthenticatedUser(): Promise<CognitoUser | null> {
  try {
    configureCognito()
    const user = await getCurrentUser()
    return {
      userId: user.userId,
      username: user.username,
    }
  } catch {
    return null
  }
}

export async function hasValidSession() {
  try {
    configureCognito()
    const session = await fetchAuthSession()
    return Boolean(session.tokens?.accessToken)
  } catch {
    return false
  }
}

export async function signOutUser() {
  configureCognito()
  await signOut()
}
