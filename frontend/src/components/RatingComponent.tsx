import React, { useState, useEffect } from 'react';
import { Star, ThumbsUp, ThumbsDown, TrendingUp, Users } from 'lucide-react';
import api from '../utils/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { useEntityState } from '../context/InteractionStateContext';
import '../styles/components/RatingComponent.css';

interface RatingComponentProps {
  ideaId: string;
  initialRating?: number;
  averageRating?: number;
  ratingCount?: number;
  ratingDistribution?: Record<string, number>;
  onRatingChange?: (rating: number) => void;
  showDistribution?: boolean;
  compact?: boolean;
  participationToken?: string | null;
}

const RatingComponent: React.FC<RatingComponentProps> = ({
  ideaId,
  initialRating,
  averageRating = 0,
  ratingCount = 0,
  ratingDistribution = {},
  onRatingChange,
  showDistribution = false,
  compact = false,
  participationToken = null
}) => {
  const { authStatus } = useAuth();
  const { state, updateState, refreshState } = useEntityState('idea', ideaId);

  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRatingSlider, setShowRatingSlider] = useState(false);

  // Get data from context or fallback to props
  const userRating = state?.user_state?.user_rating ?? initialRating ?? null;
  const contextAverageRating = state?.metrics?.average_rating ?? 0;
  const contextRatingCount = state?.metrics?.rating_count ?? 0;
  const contextRatingDistribution = state?.metrics?.rating_distribution ?? {};

  // Use context data if available, otherwise fall back to props
  const currentAverageRating = averageRating ?? contextAverageRating;
  const currentRatingCount = ratingCount ?? contextRatingCount;
  const currentRatingDistribution = ratingDistribution ?? contextRatingDistribution;

  // Determine if user can rate
  const canRate = authStatus === 'authenticated' ||
                  (authStatus === 'unauthenticated' && !!participationToken);

  // If we don't have state data and no initial data was provided, try to refresh
  useEffect(() => {
    if (!state && !initialRating && !averageRating && !ratingCount) {
      refreshState();
    }
  }, [state, initialRating, averageRating, ratingCount, refreshState]);

  const handleLike = async () => {
    await submitRating(10);
  };

  const handleUnlike = async () => {
    await submitRating(0);
  };

  const handleStarRating = async (rating: number) => {
    await submitRating(rating);
  };

  const submitRating = async (rating: number) => {
    if (isSubmitting || !canRate) return;

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = {};
      if (participationToken) {
        headers['X-Participation-Token'] = participationToken;
      }

      // Use the interaction endpoint instead of the dedicated rate endpoint
      await api.post(`/interaction/idea/${ideaId}/rate`, { rating }, { headers });

      // Update context state optimistically
      updateState({
        user_state: {
          ...state?.user_state,
          user_rating: rating
        }
      });

      onRatingChange?.(rating);
      toast.success(`Rated ${rating}/10`);
      setShowRatingSlider(false);

      // Refresh state to get updated metrics
      setTimeout(() => refreshState(), 500);
    } catch (error) {
      console.error('Error submitting rating:', error);
      if (error.response?.status === 401) {
        toast.error('Authentication required to rate ideas');
      } else {
        toast.error('Failed to submit rating');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStars = () => {
    return Array.from({ length: 11 }, (_, i) => (
      <button
        key={i}
        className={`rating-star ${
          (hoveredRating !== null ? hoveredRating : userRating || 0) >= i ? 'active' : ''
        }`}
        onMouseEnter={() => setHoveredRating(i)}
        onMouseLeave={() => setHoveredRating(null)}
        onClick={() => handleStarRating(i)}
        disabled={isSubmitting || !canRate}
        title={canRate ? `Rate ${i}/10` : "Login or join discussion to rate"}
      >
        <Star className="w-4 h-4" />
        <span className="rating-number">{i}</span>
      </button>
    ));
  };

  const renderRatingDistribution = () => {
    if (!showDistribution || currentRatingCount === 0) return null;

    const maxCount = Math.max(...Object.values(currentRatingDistribution));

    return (
      <div className="rating-distribution">
        <h4 className="distribution-title">Rating Distribution</h4>
        <div className="distribution-bars">
          {Array.from({ length: 11 }, (_, i) => {
            const count = currentRatingDistribution[i.toString()] || 0;
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

            return (
              <div key={i} className="distribution-bar">
                <span className="bar-label">{i}</span>
                <div className="bar-container">
                  <div
                    className="bar-fill"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="bar-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (compact) {
    return (
      <div className="rating-component compact">
        <div className="rating-summary">
          <div className="rating-stats">
            <div className="average-rating">
              <Star className="w-4 h-4 text-yellow-500" />
              <span className="rating-value">
                {currentAverageRating ? currentAverageRating.toFixed(1) : '0.0'}
              </span>
            </div>
            <div className="vote-count">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="count-value">{currentRatingCount} votes</span>
            </div>
          </div>
          
          <div className="quick-actions">
            <button
              className={`quick-btn like-btn ${userRating === 10 ? 'active' : ''}`}
              onClick={handleLike}
              disabled={isSubmitting || !canRate}
              title={canRate ? "Like (Rate 10/10)" : "Login or join discussion to rate"}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              className={`quick-btn unlike-btn ${userRating === 0 ? 'active' : ''}`}
              onClick={handleUnlike}
              disabled={isSubmitting || !canRate}
              title={canRate ? "Unlike (Rate 0/10)" : "Login or join discussion to rate"}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
            <button
              className={`quick-btn rate-btn ${userRating !== null && userRating > 0 && userRating < 10 ? 'active' : ''}`}
              onClick={() => setShowRatingSlider(!showRatingSlider)}
              disabled={!canRate}
              title={canRate ? "Custom Rating" : "Login or join discussion to rate"}
            >
              <TrendingUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showRatingSlider && (
          <div className="rating-slider">
            <div className="slider-header">
              <span>Rate this idea (0-10)</span>
              <button 
                className="close-slider"
                onClick={() => setShowRatingSlider(false)}
              >
                ×
              </button>
            </div>
            <div className="stars-container">
              {renderStars()}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rating-component full">
      <div className="rating-header">
        <h3>Rate this Idea</h3>
        <div className="current-stats">
          <span className="avg-rating">
            Average: {currentAverageRating ? currentAverageRating.toFixed(1) : '0.0'}/10
          </span>
          <span className="total-votes">
            ({currentRatingCount} votes)
          </span>
        </div>
      </div>

      <div className="rating-actions">
        <div className="quick-rating">
          <button
            className={`rating-btn like ${userRating === 10 ? 'active' : ''}`}
            onClick={handleLike}
            disabled={isSubmitting || !canRate}
          >
            <ThumbsUp className="w-5 h-5" />
            <span>Like (10)</span>
          </button>
          <button
            className={`rating-btn unlike ${userRating === 0 ? 'active' : ''}`}
            onClick={handleUnlike}
            disabled={isSubmitting || !canRate}
          >
            <ThumbsDown className="w-5 h-5" />
            <span>Unlike (0)</span>
          </button>
        </div>

        <div className="custom-rating">
          <span className="rating-label">Or rate 0-10:</span>
          <div className="stars-container">
            {renderStars()}
          </div>
        </div>
      </div>

      {userRating !== null && (
        <div className="user-rating-display">
          Your rating: {userRating}/10
        </div>
      )}

      {renderRatingDistribution()}
    </div>
  );
};

export default RatingComponent;
