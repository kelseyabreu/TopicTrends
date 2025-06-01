import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { Discussion } from "../interfaces/discussions";
import { PaginatedDiscussions } from "../interfaces/pagination";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Filter } from "lucide-react";

function AllDiscussionsView() {
    const navigate = useNavigate();
    const [discussions, setDiscussions] = useState<Discussion[]>([]);
    const [filteredDiscussions, setFilteredDiscussions] = useState<Discussion[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilters, setActiveFilters] = useState<string[]>(['problems', 'challenges', 'questions', 'opportunities']);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>("");
  
    useEffect(() => {
      const fetchDiscussions = async () => {
        try {
          const response = await api.get<PaginatedDiscussions>('/discussions', {
            params: { page_size: 200 } // Get all discussions for the overview page
          });
          console.log('Discussions response:', response.data);

          // Use standardized paginated format
          const discussionsData = response.data.rows;
          setDiscussions(discussionsData);
          setFilteredDiscussions(discussionsData);
        } catch (error) {
          console.error('Error fetching discussions:', error);
          setError('Failed to load discussions. Please try again later.');
        } finally {
          setIsLoading(false);
        }
      };

      fetchDiscussions();
    }, []);

    useEffect(() => {
      let filtered = discussions;

      const query = searchQuery.toLowerCase();
      const hasSearchQuery = query !== '';
      const hasActiveFilters = activeFilters.length > 0;

      if (hasSearchQuery || hasActiveFilters) {
        // Apply search filter if query exists
        if (hasSearchQuery) {
          filtered = filtered.filter(d =>
            d.title.toLowerCase().includes(query) ||
            d.prompt.toLowerCase().includes(query)
          );
        }

        // Apply active filters if any are selected
        //TODO: Discussions need the filters in their data.
        if (hasActiveFilters) {
          filtered = filtered.filter(d => d
            // activeFilters.some(filter =>
            //   d.title.toLowerCase().includes(filter) ||
            //   d.prompt.toLowerCase().includes(filter)
            // )
          );
        }
      }
      // If neither search query nor active filters are present, 'filtered' remains the original 'discussions'

      setFilteredDiscussions(filtered);
    }, [discussions, searchQuery, activeFilters]);

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
        {/* Search Input */}
        <div className="relative mt-6 mb-6">
          <Input
            type="text"
            placeholder="Search discussions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-12 text-lg border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all duration-200 rounded-none"
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-6 w-6" />
        </div>

        {/* Filter Buttons and Apply Button */}
        <div className="flex flex-wrap items-center gap-4 mb-8">
          {['problems', 'challenges', 'questions', 'opportunities'].map((filter) => (
            <Button
              key={filter}
              onClick={() => {
                setActiveFilters(prevFilters => 
                  prevFilters.includes(filter) 
                    ? prevFilters.filter(f => f !== filter) 
                    : [...prevFilters, filter]
                );
              }}
              className={`px-6 py-3 text-lg capitalize border-4 border-black ${activeFilters.includes(filter) 
                ? 'bg-black text-white shadow-none transform translate-x-[4px] translate-y-[4px]' 
                : 'bg-white text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'} 
                transition-all duration-200 rounded-none`}
            >
              {filter}
            </Button>
          ))}
        </div>



        {filteredDiscussions.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">No discussions available.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDiscussions.map((discussion: Discussion) => (
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