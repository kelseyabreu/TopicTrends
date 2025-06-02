import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { 
  Brain, 
  Network, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  Eye,
  Lightbulb,
  Target,
  Activity
} from 'lucide-react';

interface HiddenPatternsProps {
  hiddenPatterns: any;
  loading?: boolean;
  className?: string;
}

const HiddenPatternsAnalysis: React.FC<HiddenPatternsProps> = ({
  hiddenPatterns,
  loading = false,
  className = ""
}) => {
  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!hiddenPatterns) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No hidden patterns data available. This analysis requires sufficient discussion activity.
        </AlertDescription>
      </Alert>
    );
  }

  const getConfidenceBadge = (confidence: string) => {
    const colors = {
      high: "bg-green-100 text-green-800",
      medium: "bg-yellow-100 text-yellow-800", 
      low: "bg-red-100 text-red-800"
    };
    return (
      <Badge className={colors[confidence as keyof typeof colors] || colors.low}>
        {confidence} confidence
      </Badge>
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">🔍 Hidden Patterns Analysis</h2>
        <p className="text-gray-600 text-sm md:text-base">
          Advanced AI-powered insights revealing patterns not immediately obvious in your discussion
        </p>
      </div>

      {/* Quick Insights Summary */}
      {hiddenPatterns && (
        <Card className="mb-6 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-indigo-600" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="text-center p-3 bg-white rounded-lg border">
                <div className="font-medium text-indigo-600">
                  {hiddenPatterns.semantic_evolution?.confidence || 'N/A'}
                </div>
                <div className="text-xs text-gray-600">Evolution Confidence</div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border">
                <div className="font-medium text-purple-600">
                  {hiddenPatterns.influence_networks?.insights?.total_influential_ideas || 0}
                </div>
                <div className="text-xs text-gray-600">Influential Ideas</div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border">
                <div className="font-medium text-red-600">
                  {hiddenPatterns.cognitive_biases?.insights?.total_biases_found || 0}
                </div>
                <div className="text-xs text-gray-600">Biases Detected</div>
              </div>
              <div className="text-center p-3 bg-white rounded-lg border">
                <div className="font-medium text-green-600">
                  {hiddenPatterns.emergence_patterns?.insights?.total_emerging_themes || 0}
                </div>
                <div className="text-xs text-gray-600">Emerging Themes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Semantic Evolution */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Semantic Evolution</CardTitle>
            </div>
            {hiddenPatterns.semantic_evolution?.confidence && 
              getConfidenceBadge(hiddenPatterns.semantic_evolution.confidence)
            }
          </div>
          <CardDescription>How ideas evolved semantically over time</CardDescription>
        </CardHeader>
        <CardContent>
          {hiddenPatterns.semantic_evolution?.evolution_detected ? (
            <div className="space-y-4">
              {/* Evolution Insights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp className={`h-4 w-4 ${
                      hiddenPatterns.semantic_evolution.insights?.semantic_convergence 
                        ? 'text-green-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="text-xs font-medium">Convergence</div>
                  <div className="text-xs text-gray-600">
                    {hiddenPatterns.semantic_evolution.insights?.semantic_convergence ? 'Detected' : 'Not detected'}
                  </div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="flex items-center justify-center mb-2">
                    <Activity className={`h-4 w-4 ${
                      hiddenPatterns.semantic_evolution.insights?.topic_drift 
                        ? 'text-yellow-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="text-xs font-medium">Topic Drift</div>
                  <div className="text-xs text-gray-600">
                    {hiddenPatterns.semantic_evolution.insights?.topic_drift ? 'Detected' : 'Not detected'}
                  </div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="flex items-center justify-center mb-2">
                    <Target className={`h-4 w-4 ${
                      hiddenPatterns.semantic_evolution.insights?.consensus_formation 
                        ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="text-xs font-medium">Consensus</div>
                  <div className="text-xs text-gray-600">
                    {hiddenPatterns.semantic_evolution.insights?.consensus_formation ? 'Forming' : 'Not forming'}
                  </div>
                </div>
              </div>

              {/* Time Windows */}
              {hiddenPatterns.semantic_evolution.time_windows && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Evolution Timeline</h4>
                  <div className="space-y-2">
                    {hiddenPatterns.semantic_evolution.time_windows.map((window: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border text-xs">
                        <span className="font-medium">Window {window.window}</span>
                        <div className="flex gap-4 text-gray-600">
                          <span>{window.idea_count} ideas</span>
                          <span>Intent: {(window.intent_diversity * 100).toFixed(0)}%</span>
                          <span>Sentiment: {(window.sentiment_diversity * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-600">
              <Brain className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">{hiddenPatterns.semantic_evolution?.reason || 'No semantic evolution detected'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Influence Networks */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-purple-600" />
              <CardTitle className="text-lg">Influence Networks</CardTitle>
            </div>
            {hiddenPatterns.influence_networks?.confidence && 
              getConfidenceBadge(hiddenPatterns.influence_networks.confidence)
            }
          </div>
          <CardDescription>Ideas and contributors that influenced subsequent submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {hiddenPatterns.influence_networks?.networks_detected ? (
            <div className="space-y-4">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-lg font-bold text-purple-600">
                    {hiddenPatterns.influence_networks.insights?.total_influential_ideas || 0}
                  </div>
                  <div className="text-xs text-gray-600">Influential Ideas</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border">
                  <div className="text-lg font-bold text-purple-600">
                    {hiddenPatterns.influence_networks.insights?.cascade_events || 0}
                  </div>
                  <div className="text-xs text-gray-600">Cascade Events</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border col-span-2 md:col-span-1">
                  <div className="text-lg font-bold text-purple-600">
                    {hiddenPatterns.influence_networks.insights?.avg_influence_response_time?.toFixed(1) || 0}m
                  </div>
                  <div className="text-xs text-gray-600">Avg Response Time</div>
                </div>
              </div>

              {/* Cascade Patterns */}
              {hiddenPatterns.influence_networks.cascade_patterns?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Idea Cascades</h4>
                  <div className="space-y-2">
                    {hiddenPatterns.influence_networks.cascade_patterns.slice(0, 3).map((cascade: any, idx: number) => (
                      <div key={idx} className="p-3 bg-white rounded border">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xs font-medium text-purple-600 flex-shrink-0">
                            Cascade {idx + 1}
                          </span>
                          <span className="text-xs text-gray-600 flex-shrink-0 ml-2">
                            {cascade.cascade_size} ideas
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mb-2 break-words">
                          "{cascade.catalyst_text}"
                        </p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">
                            {cascade.cascade_duration_minutes?.toFixed(1)}min duration
                          </span>
                          {cascade.avg_similarity && (
                            <span className="text-gray-500">
                              {(cascade.avg_similarity * 100).toFixed(0)}% similarity
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Thought Leaders */}
              {hiddenPatterns.influence_networks.thought_leaders?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Thought Leaders</h4>
                  <div className="space-y-2">
                    {hiddenPatterns.influence_networks.thought_leaders.slice(0, 3).map((leader: any, idx: number) => (
                      <div key={idx} className="p-2 bg-white rounded border">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-xs font-bold text-purple-600 flex-shrink-0">
                              {idx + 1}
                            </div>
                            <span className="text-sm font-medium truncate">{leader.contributor}</span>
                          </div>
                          <div className="text-xs text-gray-600 flex-shrink-0 ml-2">
                            {leader.total_influenced} influenced
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          {leader.influential_ideas_count} influential ideas
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-600">
              <Network className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">{hiddenPatterns.influence_networks?.reason || 'No influence networks detected'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile-responsive grid for remaining cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cognitive Biases */}
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg">Cognitive Biases</CardTitle>
              </div>
              {hiddenPatterns.cognitive_biases?.confidence && 
                getConfidenceBadge(hiddenPatterns.cognitive_biases.confidence)
              }
            </div>
            <CardDescription>Potential biases affecting discussion quality</CardDescription>
          </CardHeader>
          <CardContent>
            {hiddenPatterns.cognitive_biases?.biases_detected?.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Overall Risk:</span>
                  <Badge className={`${
                    hiddenPatterns.cognitive_biases.overall_bias_risk === 'high' ? 'bg-red-100 text-red-800' :
                    hiddenPatterns.cognitive_biases.overall_bias_risk === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {hiddenPatterns.cognitive_biases.overall_bias_risk}
                  </Badge>
                </div>
                
                {hiddenPatterns.cognitive_biases.biases_detected.slice(0, 3).map((bias: any, idx: number) => (
                  <div key={idx} className="p-3 bg-white rounded border">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-medium capitalize flex-1 min-w-0">
                        {bias.type.replace('_', ' ')}
                      </span>
                      <span className={`text-xs font-medium flex-shrink-0 ml-2 ${getSeverityColor(bias.severity)}`}>
                        {bias.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2 break-words">{bias.description}</p>
                    <div className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Risk Level</span>
                        <span className="text-xs text-gray-600">{(bias.score * 100).toFixed(0)}%</span>
                      </div>
                      <Progress value={bias.score * 100} className="h-1" />
                    </div>
                    <p className="text-xs text-blue-600 italic break-words">{bias.recommendation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-600">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
                <p className="text-sm">No significant cognitive biases detected</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emerging Patterns */}
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Emerging Themes</CardTitle>
              </div>
              {hiddenPatterns.emergence_patterns?.confidence && 
                getConfidenceBadge(hiddenPatterns.emergence_patterns.confidence)
              }
            </div>
            <CardDescription>New themes emerging in the discussion</CardDescription>
          </CardHeader>
          <CardContent>
            {hiddenPatterns.emergence_patterns?.emerging_themes?.length > 0 ? (
              <div className="space-y-2">
                {hiddenPatterns.emergence_patterns.emerging_themes.slice(0, 5).map((theme: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      </div>
                      <span className="text-sm font-medium">{theme.keyword}</span>
                    </div>
                    <div className="text-xs text-gray-600">
                      {theme.emergence_score}x growth
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-600">
                <Eye className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">
                  {hiddenPatterns.emergence_patterns?.reason ||
                   (hiddenPatterns.emergence_patterns?.insights?.emergence_detected === false
                    ? 'No significant emerging themes detected in this discussion'
                    : 'Insufficient data for emergence analysis')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Participation Behaviors - Full width */}
      <Card className="border-indigo-200 bg-indigo-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <CardTitle className="text-lg">Participation Behaviors</CardTitle>
            </div>
            {hiddenPatterns.participation_behaviors?.confidence && 
              getConfidenceBadge(hiddenPatterns.participation_behaviors.confidence)
            }
          </div>
          <CardDescription>Contributor archetypes and behavioral patterns</CardDescription>
        </CardHeader>
        <CardContent>
          {hiddenPatterns.participation_behaviors?.archetypes?.length > 0 ? (
            <div className="space-y-4">
              {/* Archetype Distribution */}
              {hiddenPatterns.participation_behaviors.archetype_distribution && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Archetype Distribution</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                    {Object.entries(hiddenPatterns.participation_behaviors.archetype_distribution).map(([archetype, count]: [string, any]) => (
                      <div key={archetype} className="text-center p-2 bg-white rounded border">
                        <div className="text-lg font-bold text-indigo-600">{count}</div>
                        <div className="text-xs text-gray-600 break-words">{archetype}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Contributors by Archetype */}
              <div>
                <h4 className="text-sm font-medium mb-2">Notable Contributors</h4>
                <div className="space-y-2">
                  {hiddenPatterns.participation_behaviors.archetypes.slice(0, 6).map((contributor: any, idx: number) => (
                    <div key={idx} className="p-2 bg-white rounded border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate flex-1 min-w-0">{contributor.contributor}</span>
                        <span className="text-xs text-gray-600 flex-shrink-0 ml-2">{contributor.idea_count} ideas</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {contributor.archetype}
                        </Badge>
                        {contributor.dominant_intent && (
                          <span className="text-xs text-gray-500">
                            {contributor.dominant_intent}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-gray-600">
              <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">
                {hiddenPatterns.participation_behaviors?.reason || 'Insufficient data for detailed behavior analysis'}
              </p>
              {hiddenPatterns.participation_behaviors?.confidence === 'low' && (
                <p className="text-xs text-gray-500 mt-2">
                  More contributors needed for comprehensive archetype analysis
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HiddenPatternsAnalysis;
