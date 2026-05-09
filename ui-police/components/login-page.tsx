"use client"

import { useState } from "react"
import { loginWithPassword } from "@/src/lib/auth-token"
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

interface LoginPageProps {
  onLogin: () => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [step, setStep] = useState(1)
  const [policeId, setPoliceId] = useState("")
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
      await loginWithPassword(policeId, password)
      onLogin()
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Login failed")
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width%3D%2260%22 height%3D%2260%22 viewBox%3D%220 0 60 60%22 xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3Cg fill%3D%22none%22 fillRule%3D%22evenodd%22%3E%3Cg fill%3D%22%23ffffff%22 fillOpacity%3D%220.02%22%3E%3Ccircle cx%3D%2230%22 cy%3D%2230%22 r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
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

        {/* Main Login Card */}
        <Card className="bg-slate-800/80 backdrop-blur-lg border-slate-700/50 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-white">DM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Police ID */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t.policeId}</label>
                <Input
                  type="text"
                  value={policeId}
                  onChange={(e) => setPoliceId(e.target.value)}
                  placeholder="Enter your police ID"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              {/* Step 2: Password */}
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

              {/* Step 3: Second Factor Authentication */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Second Factor Authentication</label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <Button
                    variant={authMethod === "biometric" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAuthMethod("biometric")}
                    className={authMethod !== "biometric" ? "bg-transparent border-slate-600 text-slate-300" : ""}
                  >
                    <Fingerprint className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={authMethod === "token" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAuthMethod("token")}
                    className={authMethod !== "token" ? "bg-transparent border-slate-600 text-slate-300" : ""}
                  >
                    <CreditCard className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={authMethod === "otp" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAuthMethod("otp")}
                    className={authMethod !== "otp" ? "bg-transparent border-slate-600 text-slate-300" : ""}
                  >
                    <Smartphone className="w-4 h-4" />
                  </Button>
                </div>

                {/* Authentication Method Display */}
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
                    <div className="space-y-3">
                      <Smartphone className="w-8 h-8 text-purple-400 mx-auto" />
                      <p className="text-sm text-slate-300">{t.enterOtp}</p>
                      <Button size="sm" variant="outline" className="bg-transparent border-slate-600 text-slate-300">
                        {t.sendCode}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {loginError && (
                <p className="text-sm text-red-400 text-center" role="alert">
                  {loginError}
                </p>
              )}

              {/* Authenticate Button */}
              <Button
                onClick={() => void handleAuthenticate()}
                disabled={!policeId.trim() || isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 text-lg"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t.authenticating}
                  </div>
                ) : (
                  t.authenticate
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 space-y-4">
          {/* Language Toggle */}
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

          {/* Compliance Text */}
          <div className="bg-slate-800/30 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-400">Legal Notice</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{t.compliance}</p>
          </div>

          {/* Support & Branding */}
          <div className="text-center space-y-2">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
              {t.contactHq}
            </Button>
            <p className="text-xs text-slate-500">{t.poweredBy}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
