import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DollarSign,
  Clock,
  TrendingUp,
  Users,
  Zap,
  Target,
  CheckCircle,
  ArrowUp,
  Info,
  Loader2,
  RefreshCw,
  Calculator,
  Eye
} from 'lucide-react';
import api from '../utils/api';
import { toast } from 'react-toastify';

interface ROIMetrics {
  discussion_duration_hours: number;
  calculation_transparency: {
    manual_processing: {
      base_time_per_idea_seconds: number;
      topic_creation_time_seconds: number;
      complexity_factor: number;
      complexity_description: string;
      total_manual_time_seconds: number;
      formula: string;
    };
    ai_processing: {
      ai_processing_per_idea_seconds: number;
      review_time_per_idea_seconds: number;
      ai_complexity_factor: number;
      total_ai_time_seconds: number;
      formula: string;
    };
    cost_calculation: {
      hourly_rate: number;
      time_saved_hours: number;
      formula: string;
    };
    projections: {
      usage_frequency: string;
      frequency_description: string;
      monthly_multiplier: number;
      annual_multiplier: number;
    };
  };
  efficiency: {
    total_ideas: number;
    total_topics: number;
    total_participants: number;
    ideas_per_active_period: number;
    participant_engagement_density: number;
    clustering_efficiency: number;
    ideas_per_participant: number;
    processing_speed_multiplier: number;
  };
  time_savings: {
    traditional_time_hours: number;
    ai_time_hours: number;
    time_saved_hours: number;
    time_saved_percentage: number;
    time_saved_minutes: number;
    traditional_time_seconds: number;
    ai_time_seconds: number;
    time_saved_seconds: number;
  };
  cost_savings: {
    hourly_rate: number;
    total_cost_savings: number;
    cost_per_idea: number;
    cost_per_participant: number;
    monthly_savings_projection: number;
    annual_savings_projection: number;
  };
  engagement: {
    total_interactions: number;
    engagement_rate: number;
    participation_rate: number;
    interaction_velocity: number;
  };
  business_impact: {
    decision_speed: string;
    scale_efficiency: string;
    cost_efficiency: string;
    engagement_multiplier: string;
    volume_advantage: string;
  };
}

interface ROIDashboardData {
  discussion_id: string;
  discussion_title: string;
  time_window: string;
  roi_metrics: ROIMetrics;
  analytics_summary: {
    total_ideas: number;
    total_participants: number;
    total_topics: number;
    health_score: number;
  };
  generated_at: string;
}

interface ROIDashboardProps {
  discussionId: string;
  className?: string;
  // 🚀 SMART PROPS: Accept consolidated data and sync parameters
  roiData?: any | null;
  loading?: boolean;
  error?: string | null;
  timeWindow?: string;  // For parameter synchronization
}

const ROIDashboard: React.FC<ROIDashboardProps> = ({
  discussionId,
  className = "",
  roiData: propRoiData,
  loading: propLoading = false,
  error: propError = null,
  timeWindow: propTimeWindow
}) => {
  const [internalRoiData, setInternalRoiData] = useState<ROIDashboardData | null>(null);
  const [internalLoading, setInternalLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  // 🚀 SMART STATE: Initialize state variables first
  const [timeWindow, setTimeWindow] = useState(propTimeWindow || 'all');
  const [hourlyRate, setHourlyRate] = useState(30);
  const [hourlyRateInput, setHourlyRateInput] = useState('30'); // For input display
  const [hourlyRatePending, setHourlyRatePending] = useState(false); // Show pending state
  const [usageFrequency, setUsageFrequency] = useState('monthly');
  const [showCalculations, setShowCalculations] = useState(false);
  const [lastFetchParams, setLastFetchParams] = useState<string>(''); // Prevent duplicate calls

  // 🚀 SMART DATA HANDLING: Use props if available and parameters match, otherwise fetch internally
  const shouldUseProps = propRoiData &&
    propRoiData.time_window === timeWindow &&
    propRoiData.roi_metrics?.calculation_transparency?.cost_calculation?.hourly_rate === hourlyRate;

  const roiData = shouldUseProps ? propRoiData : internalRoiData;
  const loading = shouldUseProps ? propLoading : internalLoading;
  const error = shouldUseProps ? propError : internalError;

  // 🚀 SAFE ROI SUMMARY: Extract ROI summary with proper null checks
  const roiSummary = roiData?.roi_metrics ? {
    total_cost_savings: roiData.roi_metrics.cost_savings?.total_cost_savings || 0,
    time_saved_hours: roiData.roi_metrics.time_savings?.time_saved_hours || 0,
    time_saved_percentage: roiData.roi_metrics.time_savings?.time_saved_percentage || 0,
    total_participants: roiData.roi_metrics.efficiency?.total_participants || 0,
    total_ideas: roiData.roi_metrics.efficiency?.total_ideas || 0,
    processing_speed_multiplier: roiData.roi_metrics.efficiency?.processing_speed_multiplier || 0,
    volume_advantage: roiData.roi_metrics.business_impact?.volume_advantage || "AI scales better"
  } : null;

  // 🚀 SYNC EFFECT: Keep timeWindow in sync with parent
  useEffect(() => {
    if (propTimeWindow && propTimeWindow !== timeWindow) {
      setTimeWindow(propTimeWindow);
    }
  }, [propTimeWindow, timeWindow]);

  // Debounced effect for hourly rate input
  useEffect(() => {
    // Check if the input value is different from current hourly rate
    const inputRate = parseFloat(hourlyRateInput);
    if (!isNaN(inputRate) && inputRate !== hourlyRate) {
      setHourlyRatePending(true);
    }

    const timer = setTimeout(() => {
      const rate = parseFloat(hourlyRateInput);
      if (!isNaN(rate) && rate > 0 && rate <= 500) {
        setHourlyRate(rate);
        setHourlyRatePending(false);
      }
    }, 2000); // 2 second delay

    return () => {
      clearTimeout(timer);
      if (!isNaN(inputRate) && inputRate === hourlyRate) {
        setHourlyRatePending(false);
      }
    };
  }, [hourlyRateInput, hourlyRate]);

  useEffect(() => {
    // 🚀 PROFESSIONAL HYBRID APPROACH: Fetch when parameters don't match props
    const currentParams = `${discussionId}-${timeWindow}-${hourlyRate}-${usageFrequency}`;

    // Fetch if: no props, parameters changed, or props don't match current parameters
    const shouldFetch = !shouldUseProps && currentParams !== lastFetchParams;

    if (shouldFetch) {
      setLastFetchParams(currentParams);
      fetchROIData();
    } else if (shouldUseProps) {
      // Using props - ensure internal loading is false
      setInternalLoading(false);
      setInternalError(null);
    }
  }, [discussionId, timeWindow, hourlyRate, usageFrequency, lastFetchParams, shouldUseProps]);

  const fetchROIData = async () => {
    // Use different loading states based on whether this is initial load or update
    if (!internalRoiData) {
      setInternalLoading(true);
    } else {
      setMetricsLoading(true);
    }
    setInternalError(null);

    try {
      // 🚀 UNIFIED ENDPOINT: Use /summary with include_roi=true (fallback when no props)
      const response = await api.get(`/analytics/summary`, {
        params: {
          discussion_id: discussionId,
          time_window: timeWindow,
          include_roi: true,
          hourly_rate: hourlyRate,
          usage_frequency: usageFrequency
        }
      });
      setInternalRoiData(response.data);
    } catch (err: any) {
      console.error('Error fetching ROI data:', err);
      setInternalError('Failed to load ROI metrics');
      toast.error('Failed to load ROI data');
    } finally {
      setInternalLoading(false);
      setMetricsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatTime = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    }
    return `${hours.toFixed(1)}h`;
  };

  if (loading) {
    return (
      <div className={`${className} animate-pulse`}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <span className="ml-3 text-lg">Calculating ROI...</span>
        </div>
      </div>
    );
  }

  // 🚀 ENHANCED ERROR HANDLING: Better checks for different data structures
  if (error) {
    return (
      <div className={`${className} text-center py-8`}>
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={fetchROIData} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (!roiData) {
    return (
      <div className={`${className} text-center py-8`}>
        <p className="text-gray-500 mb-4">No ROI data available</p>
        <Button onClick={fetchROIData} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Load ROI Data
        </Button>
      </div>
    );
  }

  // 🚀 FLEXIBLE DATA ACCESS: Handle different data structures
  const metrics = roiData.roi_metrics || roiData;
  const analytics_summary = roiData.analytics_summary;

  // Safety check for metrics structure
  if (!metrics || !metrics.cost_savings || !metrics.time_savings || !metrics.efficiency) {
    return (
      <div className={`${className} text-center py-8`}>
        <p className="text-orange-500 mb-4">ROI data is loading or incomplete...</p>
        <div className="text-sm text-gray-600 mb-4">
          <p>Expected: cost_savings, time_savings, efficiency</p>
          <p>Received: {Object.keys(metrics || {}).join(', ') || 'No data'}</p>
        </div>
        <Button onClick={fetchROIData} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="h-5 w-5 lg:h-6 lg:w-6 text-green-600 shrink-0" />
            <h2 className="text-xl lg:text-2xl font-bold truncate">ROI Dashboard</h2>
            <Badge variant="default" className="bg-green-100 text-green-800 shrink-0">
              Live Metrics
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="hourly-rate" className="text-xs">
                Hourly Rate
              </Label>
              <div className="flex items-center gap-1">
                <span className="text-sm">$</span>
                <Input
                  id="hourly-rate"
                  type="number"
                  value={hourlyRateInput}
                  onChange={(e) => setHourlyRateInput(e.target.value)}
                  className={`w-16 sm:w-20 h-8 ${hourlyRatePending ? 'border-orange-300 bg-orange-50' : ''}`}
                  min="1"
                  max="500"
                  placeholder="30"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1 min-w-[120px]">
              <Label htmlFor="usage-frequency" className="text-xs">Usage Frequency</Label>
              <Select value={usageFrequency} onValueChange={setUsageFrequency}>
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-[100px]">
              <Label htmlFor="time-window" className="text-xs">Time Window</Label>
              <Select value={timeWindow} onValueChange={setTimeWindow}>
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue />
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
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Calculations</Label>
              <Button
                onClick={() => setShowCalculations(!showCalculations)}
                variant="outline"
                size="sm"
                className="h-8 px-3"
              >
                <Calculator className="h-3 w-3 mr-1" />
                {showCalculations ? 'Hide' : 'Show'}
              </Button>
            </div>

          </div>
        </div>
        <p className="text-gray-600 text-sm lg:text-base truncate">
          Business value analysis for "{roiData.discussion_title || 'Discussion'}"
        </p>
      </div>

      {/* Key ROI Metrics - 30 Second Value Proposition */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Cost Savings */}
        <Card className="border-green-200 bg-green-50 relative">
          {metricsLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg z-10">
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            </div>
          )}
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Cost Savings
            </CardTitle>
            <CardDescription>vs. Manual Processing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 mb-1">
              {formatCurrency(metrics.cost_savings.total_cost_savings)}
            </div>
            <div className="flex items-center gap-1 text-sm text-green-700">
              <ArrowUp className="h-3 w-3" />
              {metrics.time_savings.time_saved_percentage}% efficiency gain
            </div>
          </CardContent>
        </Card>

        {/* Time Savings */}
        <Card className="border-blue-200 bg-blue-50 relative">
          {metricsLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg z-10">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Time Saved
            </CardTitle>
            <CardDescription>AI vs. Manual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {formatTime(metrics.time_savings.time_saved_hours)}
            </div>
            <div className="text-sm text-blue-700">
              {formatTime(metrics.time_savings.ai_time_hours)} vs {formatTime(metrics.time_savings.traditional_time_hours)}
            </div>
          </CardContent>
        </Card>

        {/* Processing Speed */}
        <Card className="border-purple-200 bg-purple-50 relative">
          {metricsLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg z-10">
              <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
            </div>
          )}
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-600" />
              Speed Multiplier
            </CardTitle>
            <CardDescription>AI Processing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 mb-1">
              {metrics.efficiency.processing_speed_multiplier}x
            </div>
            <div className="text-sm text-purple-700">
              faster than traditional
            </div>
          </CardContent>
        </Card>

        {/* Engagement */}
        <Card className="border-orange-200 bg-orange-50 relative">
          {metricsLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg z-10">
              <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
            </div>
          )}
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-600" />
              Engagement
            </CardTitle>
            <CardDescription>Interaction Rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 mb-1">
              {metrics.engagement.engagement_rate}x
            </div>
            <div className="text-sm text-orange-700">
              {metrics.engagement.total_interactions} total interactions
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calculation Transparency */}
      {showCalculations && (
        <Card className="bg-gradient-to-r from-gray-50 to-blue-50 border-gray-200 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              Calculation Transparency
            </CardTitle>
            <CardDescription>See exactly how these ROI numbers are calculated</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Manual Processing */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Manual Processing Time
                </h4>
                <div className="bg-white p-4 rounded-lg border">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Base time per idea:</span>
                      <span className="font-mono">{metrics.calculation_transparency.manual_processing.base_time_per_idea_seconds}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Topic creation time:</span>
                      <span className="font-mono">{metrics.calculation_transparency.manual_processing.topic_creation_time_seconds}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Complexity factor:</span>
                      <span className="font-mono">{metrics.calculation_transparency.manual_processing.complexity_factor}x</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      {metrics.calculation_transparency.manual_processing.complexity_description}
                    </div>
                    <div className="text-xs text-blue-600 mt-1 font-medium">
                      Logarithmic scaling: Gets exponentially harder with volume
                    </div>
                    <div className="border-t pt-2 mt-3">
                      <div className="font-mono text-xs bg-gray-100 p-2 rounded">
                        {metrics.calculation_transparency.manual_processing.formula}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Processing */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  AI Processing Time
                </h4>
                <div className="bg-white p-4 rounded-lg border">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>AI processing per idea:</span>
                      <span className="font-mono">{metrics.calculation_transparency.ai_processing.ai_processing_per_idea_seconds}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Review time per idea:</span>
                      <span className="font-mono">{metrics.calculation_transparency.ai_processing.review_time_per_idea_seconds}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span>AI complexity factor:</span>
                      <span className="font-mono">{metrics.calculation_transparency.ai_processing.ai_complexity_factor}x</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      AI scales much better than manual processing
                    </div>
                    <div className="text-xs text-green-600 mt-1 font-medium">
                      Minimal logarithmic scaling: Advantage grows with volume
                    </div>
                    <div className="border-t pt-2 mt-3">
                      <div className="font-mono text-xs bg-gray-100 p-2 rounded">
                        {metrics.calculation_transparency.ai_processing.formula}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Calculation */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Cost Calculation
                </h4>
                <div className="bg-white p-4 rounded-lg border">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Hourly rate:</span>
                      <span className="font-mono">${metrics.calculation_transparency.cost_calculation.hourly_rate}/hour</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Time saved:</span>
                      <span className="font-mono">{metrics.calculation_transparency.cost_calculation.time_saved_hours} hours</span>
                    </div>
                    <div className="border-t pt-2 mt-3">
                      <div className="font-mono text-xs bg-gray-100 p-2 rounded">
                        {metrics.calculation_transparency.cost_calculation.formula}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Projections */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Projections
                </h4>
                <div className="bg-white p-4 rounded-lg border">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Usage frequency:</span>
                      <span className="font-mono">{metrics.calculation_transparency.projections.usage_frequency}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      {metrics.calculation_transparency.projections.frequency_description}
                    </div>
                    <div className="space-y-1 mt-3">
                      <div className="flex justify-between">
                        <span>Monthly multiplier:</span>
                        <span className="font-mono">{metrics.calculation_transparency.projections.monthly_multiplier}x</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Annual multiplier:</span>
                        <span className="font-mono">{metrics.calculation_transparency.projections.annual_multiplier}x</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Business Impact Summary */}
      <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-blue-200 mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            30-Second Business Impact
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                <span className="font-medium">Decision Speed</span>
                <span className="text-green-600 font-bold">{metrics.business_impact.decision_speed}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                <span className="font-medium">Scale Efficiency</span>
                <span className="text-blue-600 font-bold">{metrics.business_impact.scale_efficiency}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                <span className="font-medium">Cost Efficiency</span>
                <span className="text-purple-600 font-bold">{metrics.business_impact.cost_efficiency}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                <span className="font-medium">Engagement</span>
                <span className="text-orange-600 font-bold">{metrics.business_impact.engagement_multiplier}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
                <span className="font-medium">Volume Advantage</span>
                <span className="text-indigo-600 font-bold">{metrics.business_impact.volume_advantage}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Efficiency Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Efficiency Metrics
            </CardTitle>
            <CardDescription>How TopicTrends optimizes your process</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Ideas per Active Period</span>
                <Badge variant="default">
                  {metrics.efficiency.ideas_per_active_period}
                </Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Ideas per Participant</span>
                <Badge variant="neutral">
                  {metrics.efficiency.ideas_per_participant}
                </Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Engagement Density</span>
                <Badge variant="neutral">
                  {metrics.efficiency.participant_engagement_density}
                </Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">AI Clustering Rate</span>
                <Badge variant="neutral">
                  {Math.round((1 - metrics.efficiency.clustering_efficiency) * 100)}%
                </Badge>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Total Participants</span>
                <Badge variant="neutral">
                  {metrics.efficiency.total_participants}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Cost Analysis
            </CardTitle>
            <CardDescription>Detailed savings breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Cost per Idea</span>
                <span className="font-bold text-green-600">
                  {formatCurrency(metrics.cost_savings.cost_per_idea)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Cost per Participant</span>
                <span className="font-bold text-green-600">
                  {formatCurrency(metrics.cost_savings.cost_per_participant)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Monthly Projection</span>
                <span className="font-bold text-blue-600">
                  {formatCurrency(metrics.cost_savings.monthly_savings_projection)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Annual Projection</span>
                <span className="font-bold text-purple-600">
                  {formatCurrency(metrics.cost_savings.annual_savings_projection)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Executive Summary */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-600" />
            Executive Summary
          </CardTitle>
          <CardDescription>Key takeaways for decision makers</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-green-600 mb-1">
                {formatCurrency(metrics.cost_savings.total_cost_savings)}
              </div>
              <div className="text-sm text-gray-600">Immediate Savings</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-blue-600 mb-1">
                {metrics.time_savings.time_saved_percentage}%
              </div>
              <div className="text-sm text-gray-600">Faster Processing</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-purple-600 mb-1">
                {metrics.efficiency.total_ideas}
              </div>
              <div className="text-sm text-gray-600">Ideas Processed</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border">
              <div className="text-2xl font-bold text-orange-600 mb-1">
                {analytics_summary.health_score}%
              </div>
              <div className="text-sm text-gray-600">Health Score</div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-white rounded-lg border">
            <h4 className="font-semibold mb-2">Bottom Line Impact:</h4>
            <p className="text-gray-700">
              TopicTrends processed <strong>{metrics.efficiency.total_ideas} ideas</strong> from{' '}
              <strong>{metrics.efficiency.total_participants} participants</strong> in{' '}
              <strong>{formatTime(metrics.discussion_duration_hours)}</strong>, saving{' '}
              <strong>{formatCurrency(metrics.cost_savings.total_cost_savings)}</strong> compared to traditional manual processing.
              This represents a <strong>{metrics.time_savings.time_saved_percentage}%</strong> efficiency improvement
              and <strong>{metrics.efficiency.processing_speed_multiplier}x</strong> faster decision-making capability.
            </p>
          </div>
        </CardContent>
      </Card>


    </div>
  );
};

export default ROIDashboard;
