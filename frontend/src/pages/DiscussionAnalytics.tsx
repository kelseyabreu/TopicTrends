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
import { Loader2, Users, MessageSquare, TrendingUp, Clock, BarChart3, Activity, Brain, Target, Zap, Globe, DollarSign, Download, Eye } from 'lucide-react';
import ROIDashboard from '../components/ROIDashboard';
import HiddenPatternsAnalysis from '../components/HiddenPatternsAnalysis';
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
  const [timeWindow, setTimeWindow] = useState('24h');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [discussion, setDiscussion] = useState(null);
  const [activeTab, setActiveTab] = useState('roi'); // 🚀 DEFAULT TO ROI TAB
  const [isExporting, setIsExporting] = useState(false);

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
            // 🚀 UNIFIED ENDPOINT: Analytics + ROI in single call (ROI is default tab)
            const response = await api.get(`/analytics/summary`, {
                params: {
                    discussion_id: discussionId,
                    time_window: timeWindow,
                    include_roi: true,  // Include ROI since it's the default tab
                    hourly_rate: 30,
                    usage_frequency: 'monthly'
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

    const handleExportCSV = async () => {
        if (!discussionId) return;

        setIsExporting(true);
        try {
            const response = await api.get(`/analytics/discussions/${discussionId}/export/csv`, {
                responseType: 'blob' // Important for file downloads
            });

            // Create blob and download
            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            // Extract filename from response headers or use default
            const contentDisposition = response.headers['content-disposition'];
            let filename = 'discussion_export.csv';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            toast.success('Discussion data exported successfully!');
        } catch (error: any) {
            console.error('Error exporting CSV:', error);
            toast.error(error?.response?.data?.detail || 'Failed to export discussion data');
        } finally {
            setIsExporting(false);
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

  const {
    participation = {},
    topics = {},
    realtime = {},
    interactions = {},
    trending = {},
    content_preferences = {},
    idea_performance = {},
    contributor_diversity = {},
    hidden_patterns = {},
    engagement_heatmap = {},
    executive_summary = {}
  } = analyticsData || {};

  // Format data for charts - ensure proper chronological ordering
  const hourlyChartData = (realtime.hourly_breakdown || [])
    .sort((a: any, b: any) => {
      // Sort by datetime if available, otherwise by hour string
      if (a.datetime && b.datetime) {
        return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
      }
      return a.hour.localeCompare(b.hour);
    })
    .map((item: any) => ({
      hour: item.hour, // Use the pre-formatted label from backend
      ideas: item.ideas || 0,
      fullDate: item.datetime || item.hour // Keep original for tooltip
    }));

  const topicDistributionData = (topics.topic_distribution || []).map((topic: any) => ({
    name: topic.topic && topic.topic.length > 30 ? topic.topic.substring(0, 30) + '...' : topic.topic || 'Untitled',
    value: topic.idea_count || 0,
    fullName: topic.topic || 'Untitled'
  }));

  const interactionData = [
    { name: 'Views', value: interactions.total_views || 0, rate: interactions.avg_views_per_idea || 0 },
    { name: 'Likes', value: interactions.total_likes || 0, rate: interactions.like_rate || 0 },
    { name: 'Pins', value: interactions.total_pins || 0, rate: interactions.pin_rate || 0 },
    { name: 'Saves', value: interactions.total_saves || 0, rate: interactions.save_rate || 0 }
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
    <div className="container mx-auto p-3 sm:p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl lg:text-3xl font-bold truncate">Analytics Dashboard</h1>
            <p className="text-gray-600 mt-1 text-sm lg:text-base truncate">{discussion?.title || 'Discussion Analytics'}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 shrink-0">
            <Select value={timeWindow} onValueChange={setTimeWindow}>
              <SelectTrigger className="w-full sm:w-40 lg:w-48">
                <SelectValue placeholder="Time Window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last Hour</SelectItem>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last Week</SelectItem>
                <SelectItem value="30d">Last Month</SelectItem>
                <SelectItem value="1y">Last Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="w-full sm:w-auto whitespace-nowrap flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>

            <Button
              onClick={() => navigate(`/discussion/${discussionId}`)}
              className="w-full sm:w-auto whitespace-nowrap"
            >
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
              <div className="text-3xl font-bold">{participation.total_ideas || 0}</div>
              <p className="text-sm text-gray-600 mt-1">
                {participation.ideas_per_user || 0} per participant
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Participants</CardTitle>
              <CardDescription>Unique contributors</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{participation.unique_participants || 0}</div>
              <p className="text-sm text-gray-600 mt-1">
                {Math.round((participation.verified_ratio || 0) * 100)}% verified
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Topics</CardTitle>
              <CardDescription>Idea clusters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{topics.total_topics || 0}</div>
              <p className="text-sm text-gray-600 mt-1">
                {topics.avg_ideas_per_topic || 0} ideas per topic
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Activity</CardTitle>
              <CardDescription>Last hour</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{realtime.ideas_last_hour || 0}</div>
              <p className="text-sm text-gray-600 mt-1">
                {realtime.active_users_last_hour || 0} active users
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* 🚀 ANALYTICS + ROI + HIDDEN PATTERNS TABS */}
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 h-auto min-h-[48px] p-1">
          <TabsTrigger value="roi" className="text-xs sm:text-sm flex items-center justify-center gap-1 h-10 sm:h-auto">
            <Target className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">ROI</span>
          </TabsTrigger>
          <TabsTrigger value="patterns" className="text-xs sm:text-sm flex items-center justify-center gap-1 h-10 sm:h-auto">
            <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Hidden Patterns</span>
            <span className="sm:hidden">Patterns</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="text-xs sm:text-sm h-10 sm:h-auto">Overview</TabsTrigger>
          <TabsTrigger value="participation" className="text-xs sm:text-sm h-10 sm:h-auto">
            <span className="hidden sm:inline">Participation</span>
            <span className="sm:hidden">Parts</span>
          </TabsTrigger>
          <TabsTrigger value="engagement" className="text-xs sm:text-sm h-10 sm:h-auto">
            <span className="hidden sm:inline">Engagement</span>
            <span className="sm:hidden">Engage</span>
          </TabsTrigger>
          <TabsTrigger value="trending" className="text-xs sm:text-sm h-10 sm:h-auto">Trending</TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs sm:text-sm flex items-center justify-center gap-1 h-10 sm:h-auto">
            <Brain className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Advanced</span>
            <span className="sm:hidden">Adv</span>
          </TabsTrigger>
        </TabsList>

        {/* ROI Tab - 🚀 SMART ROI DASHBOARD: Uses props when parameters match, fetches when they don't */}
        <TabsContent value="roi" className="space-y-4">
          <ROIDashboard
            discussionId={discussionId!}
            roiData={analyticsData || null}
            loading={loading}
            error={null}
            timeWindow={timeWindow}
          />
        </TabsContent>

        {/* Hidden Patterns Tab - 🔍 ADVANCED PATTERN DETECTION */}
        <TabsContent value="patterns" className="space-y-4">
          <HiddenPatternsAnalysis
            hiddenPatterns={analyticsData?.hidden_patterns || null}
            loading={loading}
          />
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Idea Submission Timeline</CardTitle>
                <CardDescription>Ideas submitted over time</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                <div className="w-full overflow-hidden">
                  <ChartContainer config={chartConfig} className="h-[250px] sm:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyChartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="hour"
                          fontSize={12}
                          tick={{ fontSize: 10 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          fontSize={12}
                          tick={{ fontSize: 10 }}
                          width={30}
                        />
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Topic Distribution</CardTitle>
                <CardDescription>Ideas grouped by topic</CardDescription>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                <div className="w-full overflow-hidden">
                  <ChartContainer config={chartConfig} className="h-[250px] sm:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <Pie
                          data={topicDistributionData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius="70%"
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {topicDistributionData.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
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
                      <Badge variant="default">{participation.verified_ideas || 0}</Badge>
                      <span className="text-sm text-gray-600">
                        ({Math.round((participation.verified_ratio || 0) * 100)}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${(participation.verified_ratio || 0) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Anonymous Ideas</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{participation.anonymous_ideas || 0}</Badge>
                      <span className="text-sm text-gray-600">
                        ({Math.round((1 - (participation.verified_ratio || 0)) * 100)}%)
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
                    <span className="font-bold">{participation.unique_participants || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-gray-600" />
                      <span>Average Ideas per User</span>
                    </div>
                    <span className="font-bold">{participation.ideas_per_user || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-gray-600" />
                      <span>Clustering Rate</span>
                    </div>
                    <span className="font-bold">
                      {Math.round((1 - (topics.unclustered_ratio || 0)) * 100)}%
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
              <CardContent className="p-3 sm:p-6">
                <div className="w-full overflow-hidden">
                  <ChartContainer config={chartConfig} className="h-[250px] sm:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={interactionData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          fontSize={12}
                          tick={{ fontSize: 10 }}
                          interval={0}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis
                          fontSize={12}
                          tick={{ fontSize: 10 }}
                          width={30}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" fill="#3498db" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
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
                          style={{ width: `${(interactions.like_rate || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {((interactions.like_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Pin Rate</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-sky-500 h-2 rounded-full"
                          style={{ width: `${(interactions.pin_rate || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {((interactions.pin_rate || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Save Rate</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${(interactions.save_rate || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">
                        {((interactions.save_rate || 0) * 100).toFixed(1)}%
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
                <CardDescription>Most active topics in the selected time window</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(trending.trending_topics || []).length > 0 ? (
                    (trending.trending_topics || []).map((topic: any, index: number) => (
                      <div key={topic.topic_id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant="default">{index + 1}</Badge>
                          <span className="font-medium">{topic.topic || 'Untitled Topic'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{topic.recent_ideas || 0} interactions</span>
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
                  {(trending.trending_ideas || []).length > 0 ? (
                    (trending.trending_ideas || []).slice(0, 5).map((idea: any, index: number) => (
                      <div key={idea.idea_id || index} className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm mb-2">{idea.content || 'No content available'}</p>
                        <div className="flex items-center gap-3">
                          <Badge variant="neutral">{idea.interactions || 0} interactions</Badge>
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
                        {realtime.peak_activity.datetime ?
                          new Date(realtime.peak_activity.datetime).toLocaleString() :
                          realtime.peak_activity.hour || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-600">Peak hour</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">{realtime.peak_activity.ideas || 0}</p>
                    <p className="text-sm text-gray-600">ideas submitted</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Advanced Analytics Tab */}
        <TabsContent value="advanced" className="space-y-4">
          {executive_summary ? (
            <>
              {/* Executive Summary */}
              <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Brain className="h-5 w-5 mr-2 text-blue-600" />
                    Executive Summary
                  </CardTitle>
                  <CardDescription>AI-powered insights and health assessment</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-white rounded-lg border">
                      <div className="text-3xl font-bold text-blue-600">
                        {executive_summary.overall_health_score || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Health Score</div>
                      <Badge
                        variant={
                          executive_summary.health_status === 'Excellent' ? 'default' :
                          executive_summary.health_status === 'Good' ? 'default' :
                          executive_summary.health_status === 'Fair' ? 'neutral' : 'default'
                        }
                        className="mt-1"
                      >
                        {executive_summary.health_status || 'Unknown'}
                      </Badge>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-green-600">
                        {executive_summary.health_breakdown?.content_health || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Content Health</div>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-orange-600">
                        {executive_summary.health_breakdown?.performance_health || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Performance Health</div>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg border">
                      <div className="text-2xl font-bold text-purple-600">
                        {executive_summary.health_breakdown?.diversity_health || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Diversity Health</div>
                    </div>
                  </div>

                  {/* Key Insights */}
                  <div className="space-y-2">
                    <h4 className="font-medium">Key Insights</h4>
                    <div className="space-y-1">
                      {(executive_summary.key_insights || []).map((insight: string, index: number) => (
                        <div key={index} className="flex items-center text-sm">
                          <div className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
                          {insight}
                        </div>
                      ))}
                      {(!executive_summary.key_insights || executive_summary.key_insights.length === 0) && (
                        <div className="text-sm text-gray-500">No insights available</div>
                      )}
                    </div>
                  </div>

                  {/* Health Score Breakdown */}
                  {executive_summary.health_explanations && (
                    <div className="space-y-3 mt-4 pt-4 border-t">
                      <h4 className="font-medium">Health Score Breakdown</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(executive_summary.health_explanations).map(([category, data]: [string, any]) => (
                          <div key={category} className="p-3 bg-white rounded border">
                            <div className="flex justify-between items-center mb-2">
                              <h5 className="text-sm font-medium capitalize">{category.replace('_', ' ')}</h5>
                              <span className="text-sm font-bold">{data.current_score}/{data.max_score}</span>
                            </div>
                            <div className="space-y-1">
                              {data.factors.map((factor: any, idx: number) => (
                                <div key={idx} className="text-xs">
                                  <div className="flex justify-between">
                                    <span className={factor.points > 0 ? "text-green-600" : "text-gray-500"}>
                                      {factor.name}
                                    </span>
                                    <span>{factor.points}/{factor.max_points}</span>
                                  </div>
                                  {factor.points === 0 && (
                                    <div className="text-orange-600 mt-1">
                                      💡 {factor.how_to_improve}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Advanced Analytics Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Content Preferences */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Target className="h-5 w-5 mr-2 text-green-600" />
                      Content Preferences
                    </CardTitle>
                    <CardDescription>Most engaging content types and patterns</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Top Engaging Intent Types</h4>
                        <div className="space-y-2">
                          {Object.entries(content_preferences?.intent_preferences || {})
                            .slice(0, 3)
                            .map(([intent, data]: [string, any]) => (
                              <div key={intent} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <span className="capitalize">{intent}</span>
                                <div className="text-right">
                                  <div className="text-sm font-medium">{data.avg_engagement}</div>
                                  <div className="text-xs text-gray-500">{data.idea_count} ideas</div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Top Keywords</h4>
                        <div className="flex flex-wrap gap-1">
                          {content_preferences?.content_insights?.top_keywords
                            ?.slice(0, 8)
                            .map((keyword: string, index: number) => (
                              <Badge key={index} variant="neutral" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Idea Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Zap className="h-5 w-5 mr-2 text-yellow-600" />
                      Idea Performance
                    </CardTitle>
                    <CardDescription>Virality and stickiness metrics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-yellow-50 rounded-lg">
                          <div className="text-lg font-bold text-yellow-600">
                            {((idea_performance?.performance_summary?.avg_virality_score || 0) * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-600">Avg Virality</div>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-lg font-bold text-blue-600">
                            {((idea_performance?.performance_summary?.avg_stickiness_score || 0) * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-600">Avg Stickiness</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Top Viral Ideas</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {idea_performance?.top_viral_ideas
                            ?.slice(0, 3)
                            .map((idea: any, index: number) => (
                              <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                                <div className="truncate">{idea.text}</div>
                                <div className="flex justify-between text-xs text-gray-500 mt-1">
                                  <span>Virality: {((idea.metrics?.virality_score || 0) * 100).toFixed(1)}%</span>
                                  <span>{idea.metrics?.likes || 0} likes / {idea.metrics?.views || 0} views</span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>

              {/* Second Row - Contributor Diversity and Engagement Heatmap */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Contributor Diversity */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Users className="h-5 w-5 mr-2 text-purple-600" />
                      Contributor Diversity
                    </CardTitle>
                    <CardDescription>Participation patterns and inequality metrics</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-lg font-bold text-purple-600">
                            {((contributor_diversity?.diversity_metrics?.diversity_ratio || 0) * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-600">Diversity Ratio</div>
                        </div>
                        <div className="text-center p-3 bg-orange-50 rounded-lg">
                          <div className="text-lg font-bold text-orange-600">
                            {((contributor_diversity?.diversity_metrics?.gini_coefficient || 0) * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-600">Inequality</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Participation Breakdown</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Power Contributors (5+ ideas)</span>
                            <span className="font-medium">
                              {contributor_diversity?.contributor_breakdown?.power_contributors?.length || 0}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Casual Contributors (2-4 ideas)</span>
                            <span className="font-medium">
                              {contributor_diversity?.contributor_breakdown?.casual_contributors?.length || 0}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Single Contributors</span>
                            <span className="font-medium">
                              {contributor_diversity?.contributor_breakdown?.single_contributors_count || 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-sm font-medium">
                          {contributor_diversity?.participation_insights?.participation_inequality || 'N/A'}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Retention Rate: {((contributor_diversity?.participation_insights?.contributor_retention_rate || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Engagement Heatmap */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Globe className="h-5 w-5 mr-2 text-red-600" />
                      Engagement Heatmap
                    </CardTitle>
                    <CardDescription>Real-time activity patterns (last 24h)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-red-50 rounded">
                          <div className="text-sm font-bold text-red-600">
                            {engagement_heatmap?.summary?.total_interactions ||
                             ((interactions.total_views || 0) + (interactions.total_likes || 0) + (interactions.total_saves || 0))}
                          </div>
                          <div className="text-xs text-gray-600">Total</div>
                        </div>
                        <div className="p-2 bg-green-50 rounded">
                          <div className="text-sm font-bold text-green-600">
                            {engagement_heatmap?.summary?.peak_interactions || realtime.peak_activity?.ideas || 0}
                          </div>
                          <div className="text-xs text-gray-600">Peak Hour</div>
                        </div>
                        <div className="p-2 bg-blue-50 rounded">
                          <div className="text-sm font-bold text-blue-600">
                            {(engagement_heatmap?.summary?.avg_interactions_per_hour || realtime.submission_rate_per_hour || 0).toFixed ?
                              (engagement_heatmap?.summary?.avg_interactions_per_hour || realtime.submission_rate_per_hour || 0).toFixed(1) :
                              (engagement_heatmap?.summary?.avg_interactions_per_hour || realtime.submission_rate_per_hour || 0)}
                          </div>
                          <div className="text-xs text-gray-600">Avg/Hour</div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Activity Distribution</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>High Activity Hours</span>
                            <span className="font-medium">
                              {engagement_heatmap?.insights?.engagement_distribution?.high_activity_hours || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Moderate Activity Hours</span>
                            <span className="font-medium">
                              {engagement_heatmap?.insights?.engagement_distribution?.moderate_activity_hours || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Low Activity Hours</span>
                            <span className="font-medium">
                              {engagement_heatmap?.insights?.engagement_distribution?.low_activity_hours || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-sm font-medium capitalize">
                          Trend: {engagement_heatmap?.summary?.engagement_trend || 'Stable'}
                        </div>
                        {(engagement_heatmap?.summary?.peak_hour || realtime.peak_activity?.hour) && (
                          <div className="text-xs text-gray-600 mt-1">
                            Peak: {engagement_heatmap?.summary?.peak_hour || realtime.peak_activity?.hour}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </div>
            </>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Brain className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Advanced analytics data not available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Custom tooltip for pie chart
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
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