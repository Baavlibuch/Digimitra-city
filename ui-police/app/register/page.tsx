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
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width%3D%2260%22 height%3D%2260%22 viewBox%3D%220 0 60 60%22 xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3Cg fill%3D%22none%22 fillRule%3D%22evenodd%22%3E%3Cg fill%3D%22%23ffffff%22 fillOpacity%3D%220.02%22%3E%3Ccircle cx%3D%2230%22 cy%3D%2230%22 r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
        <div className="w-full max-w-md relative z-10">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-16 h-16 bg-linear-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div className="text-right">
                <Badge variant="destructive" className="bg-red-600 text-white">
                  {t.subtitle}
                </Badge>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{t.title}</h1>
            <div className="flex items-center justify-center gap-2 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>{t.networkSecure}</span>
              <CheckCircle className="w-4 h-4" />
              <span>{t.geoVerified}</span>
            </div>
          </div>
          <Card className="bg-slate-800/80 backdrop-blur-lg border-slate-700/50 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-white text-center">DM</CardTitle>
            </CardHeader>
            <CardContent>
              {!pendingVerificationEmail ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t.fullName}</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                  />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t.email}</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@department.gov.in"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                  />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t.password}</label>
                    <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => handlePasswordChange(e.target.value)}
                    placeholder="Enter your password"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 pr-10"
                  />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    {password && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>Strength:</span>
                          <div className="flex-1 bg-slate-700 rounded-full h-1">
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
                    <label className="block text-sm font-medium text-slate-300 mb-2">{t.confirmPassword}</label>
                    <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm Password"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 pr-10"
                  />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-3">Second Factor Authentication</label>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <Button
                        type="button"
                        variant={authMethod === "biometric" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAuthMethod("biometric")}
                        className={authMethod !== "biometric" ? "bg-transparent border-slate-600 text-slate-300" : ""}
                      >
                        <Fingerprint className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={authMethod === "token" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAuthMethod("token")}
                        className={authMethod !== "token" ? "bg-transparent border-slate-600 text-slate-300" : ""}
                      >
                        <CreditCard className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={authMethod === "otp" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAuthMethod("otp")}
                        className={authMethod !== "otp" ? "bg-transparent border-slate-600 text-slate-300" : ""}
                      >
                        <Smartphone className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                      {authMethod === "biometric" && (
                        <div className="space-y-2">
                          <Fingerprint className="w-8 h-8 text-blue-400 mx-auto animate-pulse" />
                          <p className="text-sm text-slate-300">{t.scanFingerprint}</p>
                        </div>
                      )}
                      {authMethod === "token" && (
                        <div className="space-y-2">
                          <CreditCard className="w-8 h-8 text-green-400 mx-auto animate-bounce" />
                          <p className="text-sm text-slate-300">{t.insertCard}</p>
                        </div>
                      )}
                      {authMethod === "otp" && (
                        <div className="space-y-2">
                          <Smartphone className="w-8 h-8 text-purple-400 mx-auto" />
                          <p className="text-sm text-slate-300">{t.enterOtp}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 text-lg"
                  >
                    {isSubmitting ? t.registering : t.register}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <Input value={pendingVerificationEmail} disabled className="bg-slate-700/50 border-slate-600 text-white" />
                  <Input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Enter OTP"
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                  />
                  <Button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 text-lg"
                  >
                    {isVerifying ? t.verifyingOtp : t.verifyOtp}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isResendingCode}
                    onClick={() => void handleResendOtp()}
                    className="w-full text-slate-300 hover:text-white"
                  >
                    {isResendingCode ? t.resendingOtp : t.resendOtp}
                  </Button>
                </form>
              )}
              {error && (
                <p className="text-sm text-red-400 mt-4" role="alert">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm text-green-400 mt-4" role="status">
                  {success}
                </p>
              )}
              <p className="text-center text-sm text-slate-300 mt-4">
                Already have an account?{" "}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-32 bg-slate-800/50 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">हिंदी</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm font-medium text-yellow-400">Legal Notice</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{t.compliance}</p>
            </div>
            <div className="text-center space-y-2">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                {t.contactHq}
              </Button>
              <p className="text-xs text-slate-500">{t.poweredBy}</p>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}
