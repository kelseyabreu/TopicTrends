import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { Session } from "../interfaces/sessions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function AllSessionsView() {
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>("");
  
    useEffect(() => {
      const fetchSessions = async () => {
        try {
          const response = await api.get('/api/sessions');
          console.log(response.data);
          setSessions(response.data);
        } catch (error) {
          console.error('Error fetching sessions:', error);
          setError('Failed to load sessions. Please try again later.');
        } finally {
          setIsLoading(false);
        }
      };
  
      fetchSessions();
    }, []);
  
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading sessions...</p>
          </div>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-[400px]">
            <CardHeader>
              <CardTitle className="text-destructive">Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
  
    return (
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Set Sail</h1>
        
        {sessions?.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">No sessions available.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session: Session) => (
              <Card 
                key={session.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/session/${session.id}`)}
              >
                <CardHeader>
                  <CardTitle>{session.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{session.prompt}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="default" className="w-full">
                    View Ocean
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
}

export default AllSessionsView;