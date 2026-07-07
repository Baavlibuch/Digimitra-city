"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Globe, AlertTriangle } from "lucide-react"
import { ThemeProvider } from "@/components/theme-provider"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
  const [language, setLanguage] = useState("en")

  const translations = {
    en: {
      subtitle: "Authorized Personnel Only",
      compliance:
        "This system is protected under the Information Technology Act, 2000. Unauthorized access is punishable.",
      poweredBy: "Powered by NIC / CCTNS",
      contactHq: "Contact HQ for assistance",
      networkSecure: "Secure Government Network",
      geoVerified: "Location Verified",
    },
    hi: {
      subtitle: "केवल अधिकृत कर्मचारी",
      compliance: "यह सिस्टम सूचना प्रौद्योगिकी अधिनियम, 2000 के तहत सुरक्षित है। अनधिकृत पहुंच दंडनीय है।",
      poweredBy: "NIC / CCTNS द्वारा संचालित",
      contactHq: "सहायता के लिए मुख्यालय से संपर्क करें",
      networkSecure: "सुरक्षित सरकारी नेटवर्क",
      geoVerified: "स्थान सत्यापित",
    },
  }

  const t = translations[language as keyof typeof translations]

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
    <ThemeProvider defaultTheme="light" defaultLanguage="en">
      <div className="min-h-screen bg-background relative flex flex-col md:flex-row overflow-hidden">
        {/* Decorative background gradients */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Language Toggle in top-right */}
        <div className="absolute top-4 right-4 z-20">
          <div className="flex items-center gap-1.5 bg-card border border-border/60 rounded-lg px-2.5 py-1 shadow-[var(--shadow-panel)]">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="border-0 bg-transparent text-foreground text-xs h-auto p-0 focus:ring-0 focus:outline-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">हिंदी</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Left side: branding and features */}
        <div className="w-full md:w-[45%] lg:w-[40%] flex flex-col justify-between p-8 lg:p-12 border-b md:border-b-0 md:border-r border-border/60 bg-muted/25 relative z-10">
          {/* Logo and Brand */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 shrink-0 overflow-hidden rounded-xl shadow-md border border-border/80">
              <img
                src="/digimitra-logo.jpeg"
                alt="Digimitra logo"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Digimitra</h1>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider -mt-0.5">AI Surveillance Portal</p>
            </div>
          </div>

          {/* Features list */}
          <div className="space-y-6 my-auto py-12 md:py-0">
            <h2 className="text-xl font-bold text-foreground">Advanced Surveillance Companion</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Welcome to the Digimitra AI Police Surveillance Portal. Authorized credentials are required to monitor live feeds, access real-time event analytics, track locations, and interface with the AI assistant.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{t.networkSecure}</p>
                  <p className="text-[11px] text-muted-foreground">Authorized Government surveillance network gateway</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{t.geoVerified}</p>
                  <p className="text-[11px] text-muted-foreground">Location verified via active police precinct coordinates</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">{t.subtitle}</p>
                  <p className="text-[11px] text-muted-foreground">Access limited to registered officers only under audit logs</p>
                </div>
              </div>
            </div>
          </div>

          {/* Left Side Footer */}
          <div className="space-y-4 pt-6">
            <div className="surface-inset p-3 bg-muted/40 border border-border/50 rounded-lg">
              <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Legal Notice</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-normal">{t.compliance}</p>
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground/60">
              <span>{t.poweredBy}</span>
              <Button variant="link" size="sm" className="text-[10px] text-muted-foreground hover:text-foreground h-auto p-0">
                {t.contactHq}
              </Button>
            </div>
          </div>
        </div>

        {/* Right side: verify card */}
        <div className="w-full md:w-[55%] lg:w-[60%] flex flex-col justify-center items-center p-6 lg:p-12 relative z-10 overflow-y-auto">
          <div className="w-full max-w-sm">
            <Card className="border border-border/80 shadow-lg bg-card">
              <CardHeader className="pb-0 text-center">
                <CardTitle className="text-base font-medium text-muted-foreground">Enter OTP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                <form onSubmit={handleVerify} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Official Email</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="officer@department.gov.in"
                      className="bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Confirmation Code</label>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="Verification Code"
                      className="bg-background text-foreground"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-red-500 text-center font-medium" role="alert">
                      {error}
                    </p>
                  )}
                  {success && (
                    <p className="text-sm text-green-500 text-center font-medium" role="status">
                      {success}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    variant="default"
                    className="w-full text-base font-semibold py-5"
                  >
                    {isSubmitting ? "Verifying..." : "Verify"}
                  </Button>
                </form>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isResending}
                  onClick={() => void handleResend()}
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                >
                  {isResending ? "Resending code..." : "Resend OTP"}
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Back to{" "}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    Login
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}
