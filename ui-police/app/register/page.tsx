"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle,
  CreditCard,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  Shield,
  Smartphone,
} from "lucide-react"
import { ThemeProvider } from "@/components/theme-provider"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isStrongPassword(password: string) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password)
}

function validateRegistrationForm(params: {
  fullName: string
  email: string
  password: string
  confirmPassword: string
}) {
  if (!params.fullName.trim()) return "Full name is required."
  if (!isValidEmail(params.email)) return "Enter a valid email address."
  if (!isStrongPassword(params.password)) {
    return "Password must be at least 8 chars and include uppercase, lowercase, number, and special character."
  }
  if (params.password !== params.confirmPassword) return "Passwords do not match."
  return null
}

export default function RegisterPage() {
  const router = useRouter()
  const { signUp, verifyAccount, resendCode } = useAuth()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResendingCode, setIsResendingCode] = useState(false)
  const [otpCode, setOtpCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [authMethod, setAuthMethod] = useState<"biometric" | "token" | "otp">("biometric")
  const [language, setLanguage] = useState("en")
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

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

  const getStrengthColor = (strength: number) => {
    if (strength < 50) return "bg-red-500"
    if (strength < 75) return "bg-yellow-500"
    return "bg-green-500"
  }

  const translations = {
    en: {
      title: "Secure Police Surveillance Portal",
      subtitle: "Authorized Personnel Only",
      fullName: "Full Name",
      email: "Official Email ID",
      password: "Password",
      confirmPassword: "Confirm Password",
      biometric: "Biometric Authentication",
      token: "Smart Card / USB Token",
      otp: "One-Time Code",
      register: "Create Account",
      registering: "Creating account...",
      verifyOtp: "Verify OTP",
      verifyingOtp: "Verifying OTP...",
      resendOtp: "Resend OTP",
      resendingOtp: "Resending OTP...",
      insertCard: "Insert Smart Card / USB Key",
      scanFingerprint: "Place finger on scanner",
      enterOtp: "Email OTP will be required for registration completion",
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
      fullName: "पूरा नाम",
      email: "आधिकारिक ईमेल आईडी",
      password: "पासवर्ड",
      confirmPassword: "पासवर्ड की पुष्टि करें",
      biometric: "बायोमेट्रिक प्रमाणीकरण",
      token: "स्मार्ट कार्ड / USB टोकन",
      otp: "वन-टाइम कोड",
      register: "अकाउंट बनाएं",
      registering: "अकाउंट बनाया जा रहा है...",
      verifyOtp: "OTP सत्यापित करें",
      verifyingOtp: "OTP सत्यापित हो रहा है...",
      resendOtp: "OTP दोबारा भेजें",
      resendingOtp: "OTP दोबारा भेजा जा रहा है...",
      insertCard: "स्मार्ट कार्ड / USB की डालें",
      scanFingerprint: "स्कैनर पर उंगली रखें",
      enterOtp: "रजिस्ट्रेशन पूरा करने के लिए ईमेल OTP आवश्यक होगा",
      compliance: "यह सिस्टम सूचना प्रौद्योगिकी अधिनियम, 2000 के तहत सुरक्षित है। अनधिकृत पहुंच दंडनीय है।",
      poweredBy: "NIC / CCTNS द्वारा संचालित",
      contactHq: "सहायता के लिए मुख्यालय से संपर्क करें",
      networkSecure: "सुरक्षित सरकारी नेटवर्क",
      geoVerified: "स्थान सत्यापित",
    },
  }

  const t = translations[language as keyof typeof translations]

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    const validationError = validateRegistrationForm({
      fullName,
      email,
      password,
      confirmPassword,
    })
    if (validationError) {
      setError(validationError)
      return
    }
    setIsSubmitting(true)
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const result = await signUp(fullName, normalizedEmail, password)
      if (result.requiresVerification) {
        setPendingVerificationEmail(normalizedEmail)
        setSuccess("OTP sent to your email. Enter it below to complete registration.")
      } else {
        setSuccess("Account created successfully. Please sign in.")
        router.push("/login")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create account.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault()
    if (!pendingVerificationEmail) return
    setError(null)
    setSuccess(null)
    if (!otpCode.trim()) {
      setError("Enter the OTP sent to your email.")
      return
    }
    setIsVerifying(true)
    try {
      await verifyAccount(pendingVerificationEmail, otpCode)
      setSuccess("Registration complete. Please sign in.")
      router.push("/login")
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP verification failed.")
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResendOtp = async () => {
    if (!pendingVerificationEmail) return
    setError(null)
    setSuccess(null)
    setIsResendingCode(true)
    try {
      await resendCode(pendingVerificationEmail)
      setSuccess("A new OTP has been sent to your email.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to resend OTP.")
    } finally {
      setIsResendingCode(false)
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

        {/* Right side: register card */}
        <div className="w-full md:w-[55%] lg:w-[60%] flex flex-col justify-center items-center p-6 lg:p-12 relative z-10 overflow-y-auto">
          <div className="w-full max-w-sm">
            <Card className="border border-border/80 shadow-lg bg-card">
              <CardHeader className="pb-0 text-center">
                <CardTitle className="text-xl font-bold text-foreground">
                  {!pendingVerificationEmail ? "Create Account" : "Verify Email"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                {!pendingVerificationEmail ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t.fullName}</label>
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Full Name"
                        className="bg-background text-foreground"
                      />
                    </div>
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
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{t.confirmPassword}</label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm Password"
                          className="bg-background text-foreground pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
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
                          <div className="space-y-2">
                            <Smartphone className="w-8 h-8 text-violet-500 mx-auto" />
                            <p className="text-xs text-muted-foreground">{t.enterOtp}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      variant="default"
                      className="w-full text-base font-semibold py-5"
                    >
                      {isSubmitting ? t.registering : t.register}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <Input value={pendingVerificationEmail} disabled className="bg-muted text-muted-foreground cursor-not-allowed" />
                    <Input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="Enter OTP"
                      className="bg-background text-foreground"
                    />
                    <Button
                      type="submit"
                      disabled={isVerifying}
                      variant="default"
                      className="w-full text-base font-semibold py-5"
                    >
                      {isVerifying ? t.verifyingOtp : t.verifyOtp}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isResendingCode}
                      onClick={() => void handleResendOtp()}
                      className="w-full text-xs text-muted-foreground hover:text-foreground mt-2"
                    >
                      {isResendingCode ? t.resendingOtp : t.resendOtp}
                    </Button>
                  </form>
                )}
                {error && (
                  <p className="text-sm text-red-500 mt-4 text-center font-medium" role="alert">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="text-sm text-green-500 mt-4 text-center font-medium" role="status">
                    {success}
                  </p>
                )}
                <p className="text-center text-xs text-muted-foreground mt-4">
                  Already have an account?{" "}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    Sign in
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
