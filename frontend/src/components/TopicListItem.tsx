import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, BarChart3, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Topic } from "../interfaces/topics";
import { Idea } from "../interfaces/ideas";
import "../styles/components/TopicListItem.css";
import InteractionButton from "./InteractionButton";

interface TopicListItemProps {
  topic: Topic;
  discussionId: string;
  onVote?: (topicId: string, direction: "up" | "down") => void;
}

const TopicListItem: React.FC<TopicListItemProps> = ({
  topic,
  discussionId,
  onVote,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [votes, setVotes] = useState(0); // In a real app, this would come from the server

  // Helper function to determine topic type based on idea count
  const getTopicType = (count: number): string => {
    if (count <= 10) return "Ripple";
    if (count <= 25) return "Wave";
    if (count <= 50) return "Breaker";
    return "Tsunami";
  };

  // Handle voting
  const handleVote = (direction: "up" | "down") => {
    if (onVote) {
      onVote(topic.id, direction);
    }
    setVotes((prev) => (direction === "up" ? prev + 1 : prev - 1));
  };

  // Toggle expanded state
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <div className="topic-list-item">
      {/* Voting section */}
      <div className="topic-vote-section">
        <button
          className="vote-button vote-up"
          onClick={() => handleVote("up")}
          aria-label="Upvote"
        >
          <ChevronUp />
        </button>
        <span className="vote-count">{votes}</span>
        <button
          className="vote-button vote-down"
          onClick={() => handleVote("down")}
          aria-label="Downvote"
        >
          <ChevronDown />
        </button>
        <InteractionButton entityType="topic" entityId={topic.id} actionType="like" className="ml-2" activeLabel="Liked" showLabel={false}/>
        <InteractionButton entityType="topic" entityId={topic.id} actionType="pin"  className="ml-2" showLabel={false}/>
        <InteractionButton entityType="topic" entityId={topic.id} actionType="save" className="ml-2" showLabel={false}/>
      </div>

      {/* Content section */}
      <div className="topic-content-section">
        {/* Header with title and metadata */}
        <div className="topic-header" onClick={toggleExpanded}>
          <h3 className="topic-title">{topic.representative_text}</h3>
          <div className="topic-meta">
            <Badge variant="default" className="topic-type-badge">
              {getTopicType(topic.count)}
            </Badge>
            <Badge variant="default" className="topic-count-badge">
              {topic.count} Ideas
            </Badge>
            <button className="expand-button">
            {
                expanded ? <ChevronsDownUp /> : <ChevronsUpDown />
            }       
            </button>
          </div>
        </div>
        {expanded && (
          <div className="topic-expanded-content">
            <div className="topic-chart">
              <BarChart3 size={24} />
              <span>Chart visualization would go here</span>
            </div>

            {/* Ideas list */}
            <div className="topic-ideas-list">
              {!topic.ideas || topic.ideas.length === 0 ? (
                <p className="no-ideas-message">
                  No ideas found in this topic.
                </p>
              ) : (
                <>
                  {/* Show limited ideas initially */}
                  {topic.ideas.slice(0, 5).map((ideaItem: Idea) => (
                    <NavLink className="idea-card" key={ideaItem.id} to={`/ideas/${ideaItem.id}`}>
                      <p className="idea-text">{ideaItem.text}</p>
                      <div className="idea-meta">
                        <span className="idea-user">
                          {ideaItem.verified ? (
                            <Badge variant="default">
                              ✓ {ideaItem.submitter_display_id || "Verified"}
                            </Badge>
                          ) : (
                            <Badge variant="neutral">
                              👤 {ideaItem.submitter_display_id || "Anonymous"}
                            </Badge>
                          )}
                        </span>
                        <span className="idea-interactions">
                            <InteractionButton entityType="idea" entityId={ideaItem.id} actionType="like" showLabel={false} />
                            <InteractionButton entityType="idea" entityId={ideaItem.id} actionType="pin" showLabel={false} />
                            <InteractionButton entityType="idea" entityId={ideaItem.id} actionType="save" showLabel={false} />
                        </span>
                        {ideaItem.timestamp && (
                          <span className="idea-timestamp">
                            {new Date(ideaItem.timestamp).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </NavLink>
                  ))}

                  {/* Show 'View All' button if many ideas */}
                  {topic.ideas.length > 5 && (
                    <NavLink
                      to={`/discussion/${discussionId}/topic/${topic.id}`}
                      className="view-all-button"
                    >
                      View all {topic.ideas.length} ideas in topic...
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