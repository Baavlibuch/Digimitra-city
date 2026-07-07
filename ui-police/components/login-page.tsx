"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Shield,
  Fingerprint,
  CreditCard,
  Smartphone,
  Eye,
  EyeOff,
  Globe,
  CheckCircle,
  AlertTriangle,
} from "lucide-react"

export function LoginPage() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [authMethod, setAuthMethod] = useState<"biometric" | "token" | "otp">("biometric")
  const [language, setLanguage] = useState("en")
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [passwordStrength, setPasswordStrength] = useState(0)

  const calculatePasswordStrength = (pwd: string) => {
    let strength = 0
    if (pwd.length >= 8) strength += 25
    if (pwd.length >= 12) strength += 25
    if (/[A-Z]/.test(pwd)) strength += 25
    if (/[0-9]/.test(pwd)) strength += 25
    if (/[^A-Za-z0-9]/.test(pwd)) strength += 25
    return Math.min(strength, 100)
  }

  const handlePasswordChange = (value: string) => {
    setPassword(value)
    setPasswordStrength(calculatePasswordStrength(value))
  }

  const handleAuthenticate = async () => {
    setLoginError(null)
    setIsLoading(true)
    try {
      await signIn(email, password)
      router.replace("/")
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Login failed"
      setLoginError(errorMessage)
      if (errorMessage.toLowerCase().includes("verify")) {
        router.push(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const getStrengthColor = (strength: number) => {
    if (strength < 50) return "bg-red-500"
    if (strength < 75) return "bg-yellow-500"
    return "bg-green-500"
  }

  const translations = {
    en: {
      title: "Secure Police Surveillance Portal",
      subtitle: "Authorized Personnel Only",
      policeId: "Police ID / Badge Number",
      email: "Official Email ID",
      password: "Password",
      biometric: "Biometric Authentication",
      token: "Smart Card / USB Token",
      otp: "One-Time Code",
      authenticate: "🔒 Authenticate",
      authenticating: "Authenticating...",
      insertCard: "Insert Smart Card / USB Key",
      scanFingerprint: "Place finger on scanner",
      enterOtp: "Enter secure code from Police VPN App",
      sendCode: "Send Secure Code",
      compliance:
        "This system is protected under the Information Technology Act, 2000. Unauthorized access is punishable.",
      poweredBy: "Powered by NIC / CCTNS",
      contactHq: "Contact HQ for assistance",
      networkSecure: "Secure Government Network",
      geoVerified: "Location Verified",
    },
    hi: {
      title: "सुरक्षित पुलिस निगरानी पोर्टल",
      subtitle: "केवल अधिकृत कर्मचारी",
      policeId: "पुलिस आईडी / बैज नंबर",
      email: "आधिकारिक ईमेल आईडी",
      password: "पासवर्ड",
      biometric: "बायोमेट्रिक प्रमाणीकरण",
      token: "स्मार्ट कार्ड / USB टोकन",
      otp: "वन-टाइम कोड",
      authenticate: "🔒 प्रमाणित करें",
      authenticating: "प्रमाणीकरण हो रहा है...",
      insertCard: "स्मार्ट कार्ड / USB की डालें",
      scanFingerprint: "स्कैनर पर उंगली रखें",
      enterOtp: "पुलिस VPN ऐप से सुरक्षित कोड दर्ज करें",
      sendCode: "सुरक्षित कोड भेजें",
      compliance: "यह सिस्टम सूचना प्रौद्योगिकी अधिनियम, 2000 के तहत सुरक्षित है। अनधिकृत पहुंच दंडनीय है।",
      poweredBy: "NIC / CCTNS द्वारा संचालित",
      contactHq: "सहायता के लिए मुख्यालय से संपर्क करें",
      networkSecure: "सुरक्षित सरकारी नेटवर्क",
      geoVerified: "स्थान सत्यापित",
    },
  }

  const t = translations[language as keyof typeof translations]

  return (
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

      {/* Right side: login card */}
      <div className="w-full md:w-[55%] lg:w-[60%] flex flex-col justify-center items-center p-6 lg:p-12 relative z-10 overflow-y-auto">
        <div className="w-full max-w-sm">
          <Card className="border border-border/80 shadow-lg bg-card">
            <CardHeader className="pb-0 text-center">
              <CardTitle className="text-xl font-bold text-foreground">Sign In</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t.email}</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@department.gov.in"
                    className="bg-background text-foreground"
                  />
                </div>

                {/* Step 2: Password */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t.password}</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      placeholder="Enter your password"
                      className="bg-background text-foreground pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  {password && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Strength:</span>
                        <div className="flex-1 bg-muted rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all ${getStrengthColor(passwordStrength)}`}
                            style={{ width: `${passwordStrength}%` }}
                          />
                        </div>
                        <span>{passwordStrength}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 3: Second Factor Authentication */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">Second Factor Authentication</label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <Button
                      type="button"
                      variant={authMethod === "biometric" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAuthMethod("biometric")}
                      className="w-full"
                    >
                      <Fingerprint className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={authMethod === "token" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAuthMethod("token")}
                      className="w-full"
                    >
                      <CreditCard className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant={authMethod === "otp" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAuthMethod("otp")}
                      className="w-full"
                    >
                      <Smartphone className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Authentication Method Display */}
                  <div className="surface-inset p-4 text-center bg-muted/30 border border-border/50 rounded-lg">
                    {authMethod === "biometric" && (
                      <div className="space-y-2">
                        <Fingerprint className="w-8 h-8 text-primary mx-auto animate-pulse" />
                        <p className="text-xs text-muted-foreground">{t.scanFingerprint}</p>
                      </div>
                    )}
                    {authMethod === "token" && (
                      <div className="space-y-2">
                        <CreditCard className="w-8 h-8 text-emerald-500 mx-auto animate-bounce" />
                        <p className="text-xs text-muted-foreground">{t.insertCard}</p>
                      </div>
                    )}
                    {authMethod === "otp" && (
                      <div className="space-y-2.5">
                        <Smartphone className="w-8 h-8 text-violet-500 mx-auto" />
                        <p className="text-xs text-muted-foreground">{t.enterOtp}</p>
                        <Button size="sm" variant="secondary" className="text-xs">
                          {t.sendCode}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {loginError && (
                  <p className="text-sm text-red-500 text-center" role="alert">
                    {loginError}
                  </p>
                )}

                {/* Authenticate Button */}
                <Button
                  onClick={() => void handleAuthenticate()}
                  disabled={!email.trim() || !password || isLoading}
                  variant="default"
                  className="w-full text-base font-semibold py-5"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      {t.authenticating}
                    </div>
                  ) : (
                    t.authenticate
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Don't have an account?{" "}
                  <Link href="/register" className="text-primary hover:underline font-medium">
                    Register
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
