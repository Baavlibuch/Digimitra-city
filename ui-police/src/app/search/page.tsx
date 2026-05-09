'use client';

import AIAgentPanel from '@/components/ai-agent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

type EventItem = {
  id: string
  event_type?: string
  description?: string
  cameraName?: string
  severity?: string
  timestamp?: string
}

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [allEvents] = useState<EventItem[]>([])
  const [filteredEvents, setFilteredEvents] = useState<EventItem[]>([]);

  const handleSearch = () => {
    const lowercasedTerm = searchTerm.toLowerCase();
    const results = allEvents.filter(event => 
      (event.event_type || '').toLowerCase().includes(lowercasedTerm) ||
      (event.description || '').toLowerCase().includes(lowercasedTerm) ||
      (event.cameraName || '').toLowerCase().includes(lowercasedTerm)
    );
    setFilteredEvents(results);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <h1 className="text-3xl font-bold mb-4">AI-Powered Search</h1>
      <div className="max-w-xl mx-auto">
        <div className="flex w-full items-center space-x-2">
            <Input 
              type="text" 
              placeholder="e.g., 'a person in a red shirt'"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button type="submit" onClick={handleSearch}>Search</Button>
        </div>
        <div className="mt-8 space-y-4">
            {filteredEvents.map((event) => (
              <Card key={event.id} className={`${event.severity === 'high' ? 'border-red-500' : ''}`}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">{event.event_type || "Event"} at {event.cameraName || "Camera"}</CardTitle>
                  <div className={`flex items-center gap-2 text-sm ${event.severity === 'high' ? 'text-red-500' : event.severity === 'medium' ? 'text-orange-500' : 'text-yellow-500'}`}>
                    <AlertTriangle className="h-4 w-4"/> 
                    <span>{(event.severity || "low").charAt(0).toUpperCase() + (event.severity || "low").slice(1)}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{event.description || "No description available"}</p>
                  <p className="text-xs text-muted-foreground mt-2">{event.timestamp ? new Date(event.timestamp).toLocaleString() : "N/A"}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>
      <AIAgentPanel />
    </div>
  );
}
