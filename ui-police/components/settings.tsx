"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTheme } from "@/components/theme-provider"
import { SettingsIcon, Camera, Shield, Zap, Monitor, HardDrive, Sun, Moon, Globe, Palette } from "lucide-react"

export function Settings() {
  const { theme, setTheme, language, setLanguage } = useTheme()
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [autoArrange, setAutoArrange] = useState(true)
  const [notifications, setNotifications] = useState(true)
  const [recordingQuality, setRecordingQuality] = useState("1080p")
  const [aiSensitivity, setAiSensitivity] = useState([75])
  const [storageLimit, setStorageLimit] = useState([80])

  const translations = {
    en: {
      title: "System Settings",
      subtitle: "Configure Digimitra surveillance system",
      general: "General",
      cameras: "Cameras",
      ai: "AI Settings",
      storage: "Storage",
      security: "Security",
      interface: "Interface Settings",
      interfaceDesc: "Configure user interface and interaction preferences",
      appearance: "Appearance & Language",
      appearanceDesc: "Customize theme and language preferences",
      theme: "Theme",
      themeDesc: "Choose your preferred color scheme",
      language: "Language",
      languageDesc: "Select your preferred language",
      voiceCommands: "Voice Commands",
      voiceDesc: "Enable voice-first interface",
      autoArrange: "Auto-arrange Feeds",
      autoDesc: "AI-powered feed prioritization",
      notifications: "Push Notifications",
      notifDesc: "Real-time alerts and updates",
      recordingQuality: "Default Recording Quality",
    },
    hi: {
      title: "सिस्टम सेटिंग्स",
      subtitle: "डिजिमित्र निगरानी सिस्टम कॉन्फ़िगर करें",
      general: "सामान्य",
      cameras: "कैमरे",
      ai: "AI सेटिंग्स",
      storage: "स्टोरेज",
      security: "सुरक्षा",
      interface: "इंटरफ़ेस सेटिंग्स",
      interfaceDesc: "उपयोगकर्ता इंटरफ़ेस और इंटरैक्शन प्राथमिकताएं कॉन्फ़िगर करें",
      appearance: "रूप और भाषा",
      appearanceDesc: "थीम और भाषा प्राथमिकताएं अनुकूलित करें",
      theme: "थीम",
      themeDesc: "अपनी पसंदीदा रंग योजना चुनें",
      language: "भाषा",
      languageDesc: "अपनी पसंदीदा भाषा चुनें",
      voiceCommands: "वॉयस कमांड",
      voiceDesc: "वॉयस-फर्स्ट इंटरफ़ेस सक्षम करें",
      autoArrange: "ऑटो-अरेंज फीड्स",
      autoDesc: "AI-संचालित फीड प्राथमिकता",
      notifications: "पुश नोटिफिकेशन",
      notifDesc: "रियल-टाइम अलर्ट और अपडेट",
      recordingQuality: "डिफ़ॉल्ट रिकॉर्डिंग गुणवत्ता",
    },
  }

  const t = translations[language]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
            <SettingsIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t.title}</h1>
            <p className="text-sm text-muted-foreground">{t.subtitle}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">{t.general}</TabsTrigger>
          <TabsTrigger value="cameras">{t.cameras}</TabsTrigger>
          <TabsTrigger value="ai">{t.ai}</TabsTrigger>
          <TabsTrigger value="storage">{t.storage}</TabsTrigger>
          <TabsTrigger value="security">{t.security}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          {/* Appearance and Language Settings Card */}
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-500" />
                {t.appearance}
              </CardTitle>
              <CardDescription>{t.appearanceDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {theme === "light" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    <Label className="text-base font-medium">{t.theme}</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.themeDesc}</p>
                  <Select value={theme} onValueChange={(value: "light" | "dark" | "system") => setTheme(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="w-4 h-4" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="w-4 h-4" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    <Label className="text-base font-medium">{t.language}</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.languageDesc}</p>
                  <Select value={language} onValueChange={(value: "en" | "hi") => setLanguage(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🇺🇸</span>
                          English
                        </div>
                      </SelectItem>
                      <SelectItem value="hi">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🇮🇳</span>
                          हिंदी (Hindi)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Interface Settings Card */}
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-blue-500" />
                {t.interface}
              </CardTitle>
              <CardDescription>{t.interfaceDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">{t.voiceCommands}</Label>
                  <p className="text-sm text-muted-foreground">{t.voiceDesc}</p>
                </div>
                <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">{t.autoArrange}</Label>
                  <p className="text-sm text-muted-foreground">{t.autoDesc}</p>
                </div>
                <Switch checked={autoArrange} onCheckedChange={setAutoArrange} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-medium">{t.notifications}</Label>
                  <p className="text-sm text-muted-foreground">{t.notifDesc}</p>
                </div>
                <Switch checked={notifications} onCheckedChange={setNotifications} />
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">{t.recordingQuality}</Label>
                <Select value={recordingQuality} onValueChange={setRecordingQuality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">720p HD</SelectItem>
                    <SelectItem value="1080p">1080p Full HD</SelectItem>
                    <SelectItem value="4k">4K Ultra HD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cameras" className="space-y-6">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-green-500" />
                Camera Management
              </CardTitle>
              <CardDescription>Configure camera settings and monitoring preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>Motion Detection Sensitivity</Label>
                  <Slider
                    value={aiSensitivity}
                    onValueChange={setAiSensitivity}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Low</span>
                    <span>{aiSensitivity[0]}%</span>
                    <span>High</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Recording Frame Rate</Label>
                  <Select defaultValue="30fps">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15fps">15 FPS</SelectItem>
                      <SelectItem value="30fps">30 FPS</SelectItem>
                      <SelectItem value="60fps">60 FPS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Active Cameras</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { name: "Camera 01", location: "Main Entrance", status: "online" },
                    { name: "Camera 02", location: "Parking Lot A", status: "alert" },
                    { name: "Camera 03", location: "Emergency Exit", status: "online" },
                    { name: "Camera 04", location: "Loading Dock", status: "offline" },
                  ].map((camera, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="font-medium text-foreground">{camera.name}</p>
                        <p className="text-sm text-muted-foreground">{camera.location}</p>
                      </div>
                      <Badge
                        variant={
                          camera.status === "online"
                            ? "default"
                            : camera.status === "alert"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {camera.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-500" />
                AI Configuration
              </CardTitle>
              <CardDescription>Configure AI detection and analysis settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-base font-medium">AI Detection Sensitivity</Label>
                <Slider value={aiSensitivity} onValueChange={setAiSensitivity} max={100} step={1} className="w-full" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Conservative</span>
                  <span>{aiSensitivity[0]}%</span>
                  <span>Aggressive</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Detection Types</h4>
                  <div className="space-y-3">
                    {[
                      { name: "Person Detection", enabled: true },
                      { name: "Vehicle Detection", enabled: true },
                      { name: "Motion Analysis", enabled: true },
                      { name: "Loitering Detection", enabled: false },
                      { name: "Crowd Analysis", enabled: false },
                    ].map((detection, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <Label>{detection.name}</Label>
                        <Switch defaultChecked={detection.enabled} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Alert Preferences</h4>
                  <div className="space-y-3">
                    {[
                      { name: "Instant Alerts", enabled: true },
                      { name: "Email Notifications", enabled: true },
                      { name: "SMS Alerts", enabled: false },
                      { name: "Auto-Recording", enabled: true },
                    ].map((alert, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <Label>{alert.name}</Label>
                        <Switch defaultChecked={alert.enabled} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="space-y-6">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-orange-500" />
                Storage Management
              </CardTitle>
              <CardDescription>Configure storage settings and retention policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-base font-medium">Storage Usage Alert Threshold</Label>
                <Slider value={storageLimit} onValueChange={setStorageLimit} max={100} step={5} className="w-full" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>50%</span>
                  <span>{storageLimit[0]}%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>Retention Period</Label>
                  <Select defaultValue="30days">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7days">7 Days</SelectItem>
                      <SelectItem value="30days">30 Days</SelectItem>
                      <SelectItem value="90days">90 Days</SelectItem>
                      <SelectItem value="1year">1 Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Backup Frequency</Label>
                  <Select defaultValue="daily">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Storage Status</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium text-foreground">Local Storage</p>
                      <p className="text-sm text-muted-foreground">2.4 TB / 4.0 TB used</p>
                    </div>
                    <Badge variant="default">60%</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium text-foreground">Cloud Backup</p>
                      <p className="text-sm text-muted-foreground">1.8 TB / 10.0 TB used</p>
                    </div>
                    <Badge variant="secondary">18%</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-500" />
                Security Settings
              </CardTitle>
              <CardDescription>Configure access control and security preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Access Control</h4>
                  <div className="space-y-3">
                    {[
                      { name: "Two-Factor Authentication", enabled: true },
                      { name: "Session Timeout", enabled: true },
                      { name: "IP Whitelist", enabled: false },
                      { name: "Audit Logging", enabled: true },
                    ].map((security, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <Label>{security.name}</Label>
                        <Switch defaultChecked={security.enabled} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Network Security</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>VPN Configuration</Label>
                      <Input placeholder="VPN Server Address" />
                    </div>
                    <div className="space-y-2">
                      <Label>Encryption Level</Label>
                      <Select defaultValue="aes256">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aes128">AES-128</SelectItem>
                          <SelectItem value="aes256">AES-256</SelectItem>
                          <SelectItem value="rsa2048">RSA-2048</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Active Sessions</h4>
                <div className="space-y-3">
                  {[
                    { device: "Desktop - Chrome", location: "New York, US", time: "Active now" },
                    { device: "Mobile - Safari", location: "New York, US", time: "2 hours ago" },
                  ].map((session, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="font-medium text-foreground">{session.device}</p>
                        <p className="text-sm text-muted-foreground">
                          {session.location} • {session.time}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
