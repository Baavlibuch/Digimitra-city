"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Shield } from "lucide-react"
import { ThemeProvider } from "@/components/theme-provider"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function VerifyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { verifyAccount, resendCode } = useAuth()

  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    if (!email.trim() || !code.trim()) {
      setError("Email and verification code are required.")
      return
    }
    setIsSubmitting(true)
    try {
      await verifyAccount(email, code)
      setSuccess("Email verified successfully. Please sign in.")
      router.push("/login")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setSuccess(null)
    if (!email.trim()) {
      setError("Enter your email to resend the code.")
      return
    }
    setIsResending(true)
    try {
      await resendCode(email)
      setSuccess("Verification code resent successfully.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend code.")
    } finally {
      setIsResending(false)
    }
  }

  return (
    <ThemeProvider defaultTheme="dark" defaultLanguage="en">
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-linear-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Verify Email</h1>
          </div>
          <Card className="bg-slate-800/80 backdrop-blur-lg border-slate-700/50 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-white text-center">Enter OTP</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Official Email"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Confirmation Code"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
                {error && (
                  <p className="text-sm text-red-400" role="alert">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="text-sm text-green-400" role="status">
                    {success}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white"
                >
                  {isSubmitting ? "Verifying..." : "Verify"}
                </Button>
              </form>
              <Button
                type="button"
                variant="ghost"
                disabled={isResending}
                onClick={() => void handleResend()}
                className="w-full mt-3 text-slate-300 hover:text-white"
              >
                {isResending ? "Resending code..." : "Resend OTP"}
              </Button>
              <p className="text-center text-sm text-slate-300 mt-4">
                Back to{" "}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  Login
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </ThemeProvider>
  )
}
