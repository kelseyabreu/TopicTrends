import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { Discussion } from "../interfaces/discussions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function AllDiscussionsView() {
    const navigate = useNavigate();
    const [discussions, setDiscussions] = useState<Discussion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>("");
  
    useEffect(() => {
      const fetchDiscussions = async () => {
        try {
          const response = await api.get('/discussions');
          console.log(response.data);
          setDiscussions(response.data);
        } catch (error) {
          console.error('Error fetching discussions:', error);
          setError('Failed to load discussions. Please try again later.');
        } finally {
          setIsLoading(false);
        }
      };
  
      fetchDiscussions();
    }, []);
  
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading discussions...</p>
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
        
        {discussions?.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">No discussions available.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discussions.map((discussion: Discussion) => (
              <Card 
                key={discussion.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/discussion/${discussion.id}`)}
              >
                <CardHeader>
                  <CardTitle>{discussion.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{discussion.prompt}</CardDescription>
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

export default AllDiscussionsView;