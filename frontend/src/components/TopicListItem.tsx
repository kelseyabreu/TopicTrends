import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Heart,
  Bookmark,
  Pin,
  MessageCircle,
  Waves,
  TrendingUp,
  Zap,
  User,
  Clock,
  Eye,
  ArrowRight,
  Sparkles,
  Users
} from "lucide-react";
import { Topic } from "../interfaces/topics";
import { Idea } from "../interfaces/ideas";
import "../styles/components/TopicListItem.css";
import InteractionButton from "./InteractionButton";
import RatingComponent from "./RatingComponent";

interface TopicListItemProps {
  topic: Topic;
  discussionId: string;
  limitIdeas?: boolean;
  participationToken?: string | null;
  disableInitialFetch?: boolean;
}

const TopicListItem: React.FC<TopicListItemProps> = ({
  topic,
  discussionId,
  limitIdeas = true,
  participationToken = null,
  disableInitialFetch = false,
}) => {
  const [expanded, setExpanded] = useState(false);

  // Modern utility functions
  const getTopicType = (count: number): string => {
    if (count <= 10) return "Ripple";
    if (count <= 25) return "Wave";
    if (count <= 50) return "Breaker";
    return "Tsunami";
  };

  const getTopicIcon = (count: number) => {
    if (count <= 10) return <MessageCircle className="w-4 h-4" />;
    if (count <= 25) return <Waves className="w-4 h-4" />;
    if (count <= 50) return <TrendingUp className="w-4 h-4" />;
    return <Zap className="w-4 h-4" />;
  };

  const getTopicTypeClass = (count: number): string => {
    if (count <= 10) return "ripple";
    if (count <= 25) return "wave";
    if (count <= 50) return "breaker";
    return "tsunami";
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return time.toLocaleDateString();
  };

  const formatFullDateTime = (timestamp: string) => {
    const time = new Date(timestamp);
    return time.toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="modern-topic-item">
      {/* Neobrutalism Topic Card */}
      <div className="topic-card">
        {/* Clean Topic Header */}
        <div className="topic-header">
          <div className="topic-meta">
            <div className={`topic-type-badge ${getTopicTypeClass(topic.count)}`}>
              <span className="topic-type-icon">{getTopicIcon(topic.count)}</span>
              <span className="topic-type-text">{getTopicType(topic.count)}</span>
            </div>
            <div className="topic-stats">
              <span className="idea-count">{topic.count} ideas</span>
            </div>
          </div>
        </div>

        {/* Topic Content */}
        <div className="topic-content">
          <h3 className="topic-title">{topic.representative_text}</h3>

          {/* Topic Actions */}
          <div className="topic-actions">
            <div className="interaction-buttons">
              <InteractionButton
                entityType="topic"
                entityId={topic.id}
                actionType="like"
                activeIcon={<Heart className="w-4 h-4" fill="currentColor" />}
                inactiveIcon={<Heart className="w-4 h-4" />}
                showLabel={false}
                className="modern-interaction-btn"
                disableInitialFetch={disableInitialFetch}
              />
              <InteractionButton
                entityType="topic"
                entityId={topic.id}
                actionType="pin"
                activeIcon={<Pin className="w-4 h-4" fill="currentColor" />}
                inactiveIcon={<Pin className="w-4 h-4" />}
                showLabel={false}
                className="modern-interaction-btn"
                disableInitialFetch={disableInitialFetch}
              />
              <InteractionButton
                entityType="topic"
                entityId={topic.id}
                actionType="save"
                activeIcon={<Bookmark className="w-4 h-4" fill="currentColor" />}
                inactiveIcon={<Bookmark className="w-4 h-4" />}
                showLabel={false}
                className="modern-interaction-btn"
                disableInitialFetch={disableInitialFetch}
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="expand-btn"
            >
              {expanded ? "Show Less" : "View Ideas"}
              <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </Button>
          </div>
        </div>
        {/* Expanded Ideas Section */}
        {expanded && (
          <div className="ideas-section">
            <div className="ideas-header">
              <div className="ideas-stats">
                <div className="stat-item">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span>{topic.ideas?.length || 0} contributors</span>
                </div>
                <div className="stat-item">
                  <BarChart3 className="w-4 h-4 text-gray-500" />
                  <span>Analytics</span>
                </div>
              </div>
            </div>

            <div className="ideas-list">
              {!topic.ideas || topic.ideas.length === 0 ? (
                <div className="no-ideas">
                  <Sparkles className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-gray-500 text-sm">No ideas in this topic yet</p>
                </div>
              ) : (
                <>
                  {(limitIdeas ? topic.ideas.slice(0, 5) : topic.ideas).map((ideaItem: Idea) => (
                    <NavLink
                      key={ideaItem.id}
                      to={`/ideas/${ideaItem.id}`}
                      className="modern-idea-card"
                    >
                      <div className="idea-header">
                        <div className="idea-author">
                          <div className="author-avatar">
                            {ideaItem.verified ? (
                              <div className="verified-avatar">
                                <User className="w-3 h-3" />
                              </div>
                            ) : (
                              <div className="anonymous-avatar">
                                <User className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                          <div className="author-info">
                            <span className="author-name">
                              {ideaItem.verified
                                ? (ideaItem.submitter_display_id || "Verified User")
                                : "Anonymous"
                              }
                            </span>
                            {ideaItem.timestamp && (
                              <span
                                className="idea-time"
                                title={formatFullDateTime(ideaItem.timestamp)}
                              >
                                <Clock className="w-3 h-3" />
                                {formatTimeAgo(ideaItem.timestamp)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="idea-interactions">
                          <InteractionButton
                            entityType="idea"
                            entityId={ideaItem.id}
                            actionType="save"
                            activeIcon={<Bookmark className="w-3 h-3" fill="currentColor" />}
                            inactiveIcon={<Bookmark className="w-3 h-3" />}
                            showLabel={false}
                            className="mini-interaction-btn"
                            disableInitialFetch={disableInitialFetch}
                          />
                        </div>
                      </div>

                      <p className="idea-text">{ideaItem.text}</p>

                      <div className="idea-footer">
                        <div className="idea-tags">
                          {ideaItem.sentiment && (
                            <span className={`sentiment-tag sentiment-${ideaItem.sentiment.toLowerCase()}`}>
                              {ideaItem.sentiment}
                            </span>
                          )}
                          {ideaItem.keywords?.slice(0, 2).map((keyword, index) => (
                            <span key={index} className="keyword-tag">
                              {keyword}
                            </span>
                          ))}
                        </div>

                        {/* Rating Component */}
                        <div className="idea-rating" onClick={(e) => e.preventDefault()}>
                          <RatingComponent
                            ideaId={ideaItem.id}
                            averageRating={ideaItem.average_rating}
                            ratingCount={ideaItem.rating_count || 0}
                            ratingDistribution={ideaItem.rating_distribution}
                            compact={true}
                            participationToken={participationToken}
                          />
                        </div>
                      </div>
                    </NavLink>
                  ))}

                  {/* View All Button */}
                  {limitIdeas && topic.ideas.length > 5 && (
                    <NavLink
                      to={`/discussion/${discussionId}/topic/${topic.id}`}
                      className="view-all-ideas-btn"
                    >
                      <div className="view-all-content">
                        <span>View all {topic.ideas.length} ideas</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </NavLink>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicListItem;
