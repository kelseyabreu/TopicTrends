import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  Clock, 
  TrendingUp, 
  ArrowRight,
  Loader2,
  Target
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../utils/api';

interface ROIWidgetProps {
  discussionId: string;
  discussionTitle?: string;
  className?: string;
  hourlyRate?: number;
  usageFrequency?: string;
  // NEW: Accept ROI data as props to eliminate duplicate API calls
  roiData?: ROISummary | null;
  loading?: boolean;
  error?: string | null;
}

interface ROISummary {
  total_cost_savings: number;
  time_saved_hours: number;
  time_saved_percentage: number;
  total_participants: number;
  total_ideas: number;
  processing_speed_multiplier: number;
  volume_advantage: string;
}

const ROIWidget: React.FC<ROIWidgetProps> = ({
  discussionId,
  discussionTitle = "Discussion",
  className = "",
  hourlyRate = 30,
  usageFrequency = "monthly",
  // NEW: Props for consolidated data
  roiData: propRoiData = null,
  loading: propLoading = false,
  error: propError = null
}) => {
  const [internalRoiData, setInternalRoiData] = useState<ROISummary | null>(null);
  const [internalLoading, setInternalLoading] = useState(true);
  const [internalError, setInternalError] = useState<string | null>(null);

  // Use props if available, otherwise use internal state
  const roiData = propRoiData || internalRoiData;
  const loading = propRoiData ? propLoading : internalLoading;
  const error = propError || internalError;

  useEffect(() => {
    // 🚀 OPTIMIZED: Only fetch data if not provided via props (legacy support)
    if (!propRoiData) {
      console.warn('ROIWidget: No data provided via props, falling back to API call. Consider using ROIDashboard for consolidated data.');
      fetchROIData();
    } else {
      // If props are provided, don't fetch and set internal loading to false
      setInternalLoading(false);
    }
  }, [discussionId, hourlyRate, usageFrequency, propRoiData]);

  const fetchROIData = async () => {
    setInternalLoading(true);
    setInternalError(null);
    try {
      // 🚀 UNIFIED ENDPOINT: Use /summary with include_roi=true (fallback)
      const response = await api.get(`/analytics/summary`, {
        params: {
          discussion_id: discussionId,
          time_window: 'all',
          include_roi: true,
          hourly_rate: hourlyRate,
          usage_frequency: usageFrequency
        }
      });
      const data = response.data;

      // Safety check for data structure
      if (!data || !data.roi_metrics || !data.roi_metrics.cost_savings || !data.roi_metrics.time_savings || !data.roi_metrics.efficiency) {
        throw new Error('Invalid ROI data structure received from server');
      }

      // Extract summary data
      setInternalRoiData({
        total_cost_savings: data.roi_metrics.cost_savings.total_cost_savings || 0,
        time_saved_hours: data.roi_metrics.time_savings.time_saved_hours || 0,
        time_saved_percentage: data.roi_metrics.time_savings.time_saved_percentage || 0,
        total_participants: data.roi_metrics.efficiency.total_participants || 0,
        total_ideas: data.roi_metrics.efficiency.total_ideas || 0,
        processing_speed_multiplier: data.roi_metrics.efficiency.processing_speed_multiplier || 0,
        volume_advantage: data.roi_metrics.business_impact.volume_advantage || "AI scales better"
      });
    } catch (err: any) {
      console.error('Error fetching ROI data:', err);
      setInternalError('Failed to load ROI data');
    } finally {
      setInternalLoading(false);
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
      <Card className={`${className} border-green-200 bg-green-50`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            <span className="ml-2 text-green-700">Loading ROI...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !roiData) {
    return (
      <Card className={`${className} border-gray-200`}>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <p className="mb-2">{error || 'No ROI data available'}</p>
            <Button onClick={fetchROIData} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className} border-green-200 bg-gradient-to-br from-green-50 to-blue-50`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-green-600" />
              ROI Summary
            </CardTitle>
            <CardDescription className="text-sm">
              {discussionTitle}
            </CardDescription>
          </div>
          <Badge variant="default" className="bg-green-100 text-green-800">
            Live
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(roiData.total_cost_savings)}
              </div>
              <div className="text-xs text-gray-600">Cost Saved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {formatTime(roiData.time_saved_hours)}
              </div>
              <div className="text-xs text-gray-600">Time Saved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {roiData.processing_speed_multiplier}x
              </div>
              <div className="text-xs text-gray-600">Faster</div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex justify-between items-center p-3 bg-white rounded-lg border">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium">
                {roiData.total_ideas} ideas from {roiData.total_participants} participants
              </span>
            </div>
          </div>

          {/* Efficiency Badge */}
          <div className="text-center p-3 bg-white rounded-lg border">
            <div className="text-lg font-bold text-orange-600 mb-1">
              {roiData.time_saved_percentage}% Efficiency Gain
            </div>
            <div className="text-xs text-gray-600">vs. Traditional Processing</div>
          </div>

          {/* Volume Advantage */}
          <div className="text-center p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
            <div className="text-sm font-bold text-purple-600 mb-1">
              Volume Advantage
            </div>
            <div className="text-xs text-purple-700">
              {roiData.volume_advantage}
            </div>
          </div>

          {/* Action Button */}
          <Link to={`/discussion/${discussionId}/analytics`}>
            <Button 
              className="w-full bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              View Full ROI Report
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default ROIWidget;
