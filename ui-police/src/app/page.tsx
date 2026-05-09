import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MainLayout } from '@/components/layout';
import { AlertTriangle, Bot, Map, Search, Video } from 'lucide-react';
import Link from 'next/link';

export default async function Dashboard() {
  const cameras: Array<{ id: string }> = [];
  const activeCameras = 0;
  const highSeverityAlerts = 0;

  return (
    <MainLayout>
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content: AI Agent Panel */}
        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Bot className="h-8 w-8" />
                <span>AI Agent</span>
              </CardTitle>
              <CardDescription>
                Your central hub for intelligent search and operations. Ask questions in natural language to find footage, identify events, and get real-time insights from your network.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex items-center justify-center">
              <Link href="/search" passHref className="w-full">
                <Button variant="outline" size="lg" className="w-full h-16 text-lg text-muted-foreground animate-pulse-slow">
                  <Search className="h-6 w-6 mr-4" />
                  Ask a question or start a search...
                </Button>
              </Link>
            </CardContent>
            <CardFooter>
                <p className="text-xs text-muted-foreground">Example: &quot;Show all red cars that ran a stop sign near 12th and Main St yesterday between 2 PM and 4 PM.&quot;</p>
            </CardFooter>
          </Card>
        </div>

        {/* Right Sidebar: Stats and Quick Actions */}
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Cameras</CardTitle>
                <Video className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeCameras}</div>
                <p className="text-xs text-muted-foreground">of {cameras.length} configured</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Alerts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{highSeverityAlerts}</div>
                <p className="text-xs text-muted-foreground">in last 24h</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Link href="/map" passHref>
                    <Button variant="outline" className="w-full justify-between">
                        <span>Explore Map View</span>
                        <Map className="h-4 w-4"/>
                    </Button>
                </Link>
                <Link href="/events" passHref>
                    <Button variant="outline" className="w-full justify-between">
                        <span>Review Events & Alerts</span>
                        <AlertTriangle className="h-4 w-4"/>
                    </Button>
                </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
