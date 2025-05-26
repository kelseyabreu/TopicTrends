// DiscussionAnalytics.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../utils/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users, MessageSquare, TrendingUp, Clock, BarChart3, Activity } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

const COLORS = ['#3498db', '#2ecc71', '#f39c12', '#e74c3c', '#9b59b6', '#1abc9c', '#34495e', '#f1c40f'];

function DiscussionAnalytics() {
  const { discussionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [timeWindow, setTimeWindow] = useState('24');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [discussion, setDiscussion] = useState(null);

  useEffect(() => {
    if (!discussionId) {
      navigate('/discussions');
      return;
    }
    fetchAnalytics();
    fetchDiscussion();
  }, [discussionId, timeWindow]);

  const fetchDiscussion = async () => {
    try {
      const response = await api.get(`/discussions/${discussionId}`);
      setDiscussion(response.data);
    } catch (error) {
      console.error('Error fetching discussion:', error);
    }
  };

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/analytics/summary`, {
                params: {
                    discussion_id: discussionId,
                    hours: parseInt(timeWindow)
                }
            });
            setAnalyticsData(response.data);
        } catch (error) {
            console.error('Error fetching analytics:', error);
            toast.error('Failed to load analytics data');
        } finally {
            setLoading(false);
        }
    };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">No Analytics Data Available</h1>
        <Button onClick={() => navigate(`/discussion/${discussionId}`)}>
          Back to Discussion
        </Button>
      </div>
    );
  }

  const { participation, topics, realtime, interactions, trending } = analyticsData;

  // Format data for charts
  const hourlyChartData = realtime.hourly_breakdown.map(item => ({
    hour: new Date(item.hour).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    ideas: item.ideas
  }));

  const topicDistributionData = topics.topic_distribution.map(topic => ({
    name: topic.topic.length > 30 ? topic.topic.substring(0, 30) + '...' : topic.topic,
    value: topic.idea_count,
    fullName: topic.topic
  }));

  const interactionData = [
    { name: 'Views', value: interactions.total_views, rate: interactions.avg_views_per_idea },
    { name: 'Likes', value: interactions.total_likes, rate: interactions.like_rate },
    { name: 'Pins', value: interactions.total_pins, rate: interactions.pin_rate },
    { name: 'Saves', value: interactions.total_saves, rate: interactions.save_rate }
  ];

  const chartConfig = {
    ideas: {
      label: "Ideas",
      color: "#3498db",
    },
    views: {
      label: "Views",
      color: "#2ecc71",
    },
    likes: {
      label: "Likes",
      color: "#f39c12",
    },
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-1">{discussion?.title || 'Discussion Analytics'}</p>
          </div>
          <div className="flex gap-4">
            <Select value={timeWindow} onValueChange={setTimeWindow}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Time Window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last Hour</SelectItem>
                <SelectItem value="24">Last 24 Hours</SelectItem>
                <SelectItem value="168">Last Week</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => navigate(`/discussion/${discussionId}`)}>
              Back to Discussion
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Total Ideas</CardTitle>
              <CardDescription>Submitted to this discussion</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{participation.total_ideas}</div>
              <p className="text-sm text-gray-600 mt-1">
                {participation.ideas_per_user} per participant
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Participants</CardTitle>
              <CardDescription>Unique contributors</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{participation.unique_participants}</div>
              <p className="text-sm text-gray-600 mt-1">
                {Math.round(participation.verified_ratio * 100)}% verified
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Topics</CardTitle>
              <CardDescription>Idea clusters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{topics.total_topics}</div>
              <p className="text-sm text-gray-600 mt-1">
                {topics.avg_ideas_per_topic} ideas per topic
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Activity</CardTitle>
              <CardDescription>Last hour</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{realtime.ideas_last_hour}</div>
              <p className="text-sm text-gray-600 mt-1">
                {realtime.active_users_last_hour} active users
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="participation">Participation</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Idea Submission Timeline</CardTitle>
                <CardDescription>Ideas submitted over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="ideas"
                        stroke="#3498db"
                        fill="#3498db"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Topic Distribution</CardTitle>
                <CardDescription>Ideas grouped by topic</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={topicDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {topicDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Participation Tab */}
        <TabsContent value="participation" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Participation Breakdown</CardTitle>
                <CardDescription>Verified vs Anonymous contributions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Verified Ideas</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">{participation.verified_ideas}</Badge>
                      <span className="text-sm text-gray-600">
                        ({Math.round(participation.verified_ratio * 100)}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${participation.verified_ratio * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Anonymous Ideas</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{participation.anonymous_ideas}</Badge>
                      <span className="text-sm text-gray-600">
                        ({Math.round((1 - participation.verified_ratio) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contribution Metrics</CardTitle>
                <CardDescription>Participant engagement levels</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-gray-600" />
                      <span>Total Participants</span>
                    </div>
                    <span className="font-bold">{participation.unique_participants}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-gray-600" />
                      <span>Average Ideas per User</span>
                    </div>
                    <span className="font-bold">{participation.ideas_per_user}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-gray-600" />
                      <span>Clustering Rate</span>
                    </div>
                    <span className="font-bold">
                      {Math.round((1 - topics.unclustered_ratio) * 100)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Engagement Tab */}
        <TabsContent value="engagement" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Interaction Metrics</CardTitle>
                <CardDescription>User engagement with ideas</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={interactionData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" fill="#3498db" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engagement Rates</CardTitle>
                <CardDescription>Interaction rates per view</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Like Rate</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-orange-500 h-2 rounded-full"
                          style={{ width: `${interactions.like_rate * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {(interactions.like_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Pin Rate</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-sky-500 h-2 rounded-full"
                          style={{ width: `${interactions.pin_rate * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {(interactions.pin_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Save Rate</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${interactions.save_rate * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {(interactions.save_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Trending Tab */}
        <TabsContent value="trending" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Trending Topics</CardTitle>
                <CardDescription>Most active topics in the last {timeWindow} hours</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trending.trending_topics.length > 0 ? (
                    trending.trending_topics.map((topic, index) => (
                      <div key={topic.topic_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="default">{index + 1}</Badge>
                          <span className="font-medium">{topic.topic}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{topic.recent_ideas} new ideas</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4">No trending topics found</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Ideas</CardTitle>
                <CardDescription>Most interacted ideas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {trending.trending_ideas.length > 0 ? (
                    trending.trending_ideas.slice(0, 5).map((idea, index) => (
                      <div key={idea.idea_id} className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm mb-2">{idea.content}</p>
                        <div className="flex items-center gap-3">
                          <Badge variant="neutral">{idea.interactions} interactions</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4">No trending ideas found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Peak Activity */}
          {realtime.peak_activity && (
            <Card>
              <CardHeader>
                <CardTitle>Peak Activity</CardTitle>
                <CardDescription>Highest submission period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Clock className="h-6 w-6 text-blue-600" />
                    <div>
                      <p className="font-medium">
                        {new Date(realtime.peak_activity.hour).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600">Peak hour</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">{realtime.peak_activity.ideas}</p>
                    <p className="text-sm text-gray-600">ideas submitted</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Custom tooltip for pie chart
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border rounded shadow-lg">
        <p className="font-medium">{payload[0].payload.fullName}</p>
        <p className="text-sm text-gray-600">{payload[0].value} ideas</p>
      </div>
    );
  }
  return null;
};

export default DiscussionAnalytics;