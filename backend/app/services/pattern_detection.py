"""
🔍 ADVANCED PATTERN DETECTION SERVICE

This module implements sophisticated pattern detection algorithms that reveal
hidden insights in discussion data that aren't immediately obvious from basic analytics.

Key Features:
- Semantic Evolution Tracking: How ideas evolve semantically over time
- Influence Network Analysis: Which ideas/contributors influence subsequent submissions  
- Cognitive Bias Detection: Groupthink, anchoring bias, confirmation bias patterns
- Emergence Pattern Recognition: Early detection of emerging themes
- Participation Behavior Profiling: Contributor archetypes and behavioral patterns
"""

import logging
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict, Counter
import statistics

logger = logging.getLogger(__name__)


async def analyze_semantic_evolution(sorted_ideas: List[Dict]) -> Dict[str, Any]:
    """
    🧬 SEMANTIC EVOLUTION TRACKING
    
    Analyzes how the semantic content of ideas evolves over time within a discussion.
    Detects convergence, divergence, and semantic drift patterns.
    
    Returns insights about:
    - Semantic convergence (ideas becoming more similar over time)
    - Topic drift (discussion moving away from original themes)
    - Consensus formation patterns
    - Semantic diversity changes
    """
    try:
        if len(sorted_ideas) < 5:
            return {
                "evolution_detected": False,
                "reason": "Need at least 5 ideas for meaningful evolution analysis",
                "confidence": "low"
            }

        # Group ideas into time windows for analysis
        time_windows = _create_time_windows(sorted_ideas, num_windows=5)
        
        # Analyze semantic characteristics in each window
        window_analysis = []
        for window_idx, window_ideas in enumerate(time_windows):
            if not window_ideas:
                continue
                
            # Extract semantic features for this window
            intents = [idea.get("intent") for idea in window_ideas if idea.get("intent")]
            sentiments = [idea.get("sentiment") for idea in window_ideas if idea.get("sentiment")]
            keywords = []
            for idea in window_ideas:
                if idea.get("keywords"):
                    keywords.extend(idea["keywords"])
            
            # Calculate diversity metrics
            intent_diversity = len(set(intents)) / max(len(intents), 1) if intents else 0
            sentiment_diversity = len(set(sentiments)) / max(len(sentiments), 1) if sentiments else 0
            keyword_diversity = len(set(keywords)) / max(len(keywords), 1) if keywords else 0
            
            window_analysis.append({
                "window": window_idx + 1,
                "idea_count": len(window_ideas),
                "intent_diversity": round(intent_diversity, 3),
                "sentiment_diversity": round(sentiment_diversity, 3),
                "keyword_diversity": round(keyword_diversity, 3),
                "dominant_intent": Counter(intents).most_common(1)[0][0] if intents else None,
                "dominant_sentiment": Counter(sentiments).most_common(1)[0][0] if sentiments else None,
                "top_keywords": [kw for kw, _ in Counter(keywords).most_common(3)]
            })

        # Detect evolution patterns
        evolution_patterns = _detect_evolution_patterns(window_analysis)
        
        return {
            "evolution_detected": True,
            "confidence": "high" if len(window_analysis) >= 4 else "medium",
            "time_windows": window_analysis,
            "patterns": evolution_patterns,
            "insights": {
                "semantic_convergence": evolution_patterns.get("convergence_detected", False),
                "topic_drift": evolution_patterns.get("drift_detected", False),
                "consensus_formation": evolution_patterns.get("consensus_detected", False)
            }
        }

    except Exception as e:
        logger.error(f"Error in semantic evolution analysis: {e}", exc_info=True)
        return {
            "evolution_detected": False,
            "error": str(e),
            "confidence": "low"
        }


async def analyze_influence_networks(sorted_ideas: List[Dict], interactions: List[Dict]) -> Dict[str, Any]:
    """
    🕸️ INFLUENCE NETWORK ANALYSIS
    
    Identifies which ideas and contributors have the most influence on subsequent submissions.
    Analyzes temporal patterns to detect idea catalysts and thought leaders.
    
    Returns insights about:
    - Influential ideas that sparked follow-up submissions
    - Thought leader contributors
    - Idea cascade patterns
    - Response timing patterns
    """
    try:
        if len(sorted_ideas) < 5:
            return {
                "networks_detected": False,
                "reason": "Need at least 5 ideas for network analysis",
                "confidence": "low"
            }

        # Analyze temporal submission patterns
        influence_scores = {}
        cascade_patterns = []
        
        for i, idea in enumerate(sorted_ideas[:-1]):  # Exclude last idea (can't influence anything)
            idea_id = str(idea["_id"])
            idea_time = idea.get("timestamp")
            
            if not idea_time:
                continue
                
            # Look for ideas submitted within influence window (next 30 minutes)
            influence_window = idea_time + timedelta(minutes=30)
            influenced_ideas = []
            
            for j in range(i + 1, len(sorted_ideas)):
                next_idea = sorted_ideas[j]
                next_time = next_idea.get("timestamp")
                
                if not next_time or next_time > influence_window:
                    break
                    
                # Check for semantic similarity or keyword overlap
                similarity_score = _calculate_idea_similarity(idea, next_idea)
                if similarity_score > 0.3:  # Threshold for influence
                    influenced_ideas.append({
                        "idea_id": str(next_idea["_id"]),
                        "similarity": similarity_score,
                        "time_gap_minutes": (next_time - idea_time).total_seconds() / 60
                    })
            
            if influenced_ideas:
                influence_scores[idea_id] = {
                    "influenced_count": len(influenced_ideas),
                    "avg_similarity": statistics.mean([idea["similarity"] for idea in influenced_ideas]),
                    "avg_response_time": statistics.mean([idea["time_gap_minutes"] for idea in influenced_ideas]),
                    "influenced_ideas": influenced_ideas
                }
                
                # Detect cascade patterns (idea influencing multiple subsequent ideas)
                # Only consider significant cascades (3+ influenced ideas with good similarity)
                if len(influenced_ideas) >= 3:
                    avg_similarity = statistics.mean([idea["similarity"] for idea in influenced_ideas])
                    if avg_similarity > 0.4:  # Only high-quality cascades
                        cascade_patterns.append({
                            "catalyst_idea_id": idea_id,
                            "catalyst_text": idea.get("text", "")[:100],
                            "cascade_size": len(influenced_ideas),
                            "cascade_duration_minutes": max([idea["time_gap_minutes"] for idea in influenced_ideas]),
                            "avg_similarity": round(avg_similarity, 3)
                        })

        # Identify thought leaders
        contributor_influence = defaultdict(list)
        for idea in sorted_ideas:
            contributor = idea.get("submitter_display_id") or idea.get("user_id", "anonymous")
            idea_id = str(idea["_id"])
            if idea_id in influence_scores:
                contributor_influence[contributor].append(influence_scores[idea_id])

        thought_leaders = []
        for contributor, influences in contributor_influence.items():
            if influences:
                avg_influence = statistics.mean([inf["influenced_count"] for inf in influences])
                total_influenced = sum([inf["influenced_count"] for inf in influences])
                # Cap total influenced to be realistic (max 50% of total ideas)
                max_realistic_influence = len(sorted_ideas) // 2
                total_influenced = min(total_influenced, max_realistic_influence)

                thought_leaders.append({
                    "contributor": contributor,
                    "influential_ideas_count": len(influences),
                    "avg_influence_score": round(avg_influence, 2),
                    "total_influenced": total_influenced
                })

        thought_leaders.sort(key=lambda x: x["total_influenced"], reverse=True)

        return {
            "networks_detected": len(influence_scores) > 0,
            "confidence": "high" if len(influence_scores) >= 3 else "medium",
            "influence_map": influence_scores,
            "cascade_patterns": cascade_patterns,
            "thought_leaders": thought_leaders[:5],  # Top 5
            "insights": {
                "total_influential_ideas": len(influence_scores),
                "cascade_events": len(cascade_patterns),
                "avg_influence_response_time": statistics.mean([
                    inf["avg_response_time"] for inf in influence_scores.values()
                ]) if influence_scores else 0
            }
        }

    except Exception as e:
        logger.error(f"Error in influence network analysis: {e}", exc_info=True)
        return {
            "networks_detected": False,
            "error": str(e),
            "confidence": "low"
        }


async def detect_cognitive_biases(sorted_ideas: List[Dict], contributor_counts: Dict) -> Dict[str, Any]:
    """
    🧠 COGNITIVE BIAS DETECTION
    
    Identifies patterns that suggest cognitive biases in group discussions:
    - Anchoring bias: Over-reliance on first ideas
    - Groupthink: Lack of diverse perspectives
    - Confirmation bias: Ideas reinforcing existing themes
    - Recency bias: Disproportionate focus on recent ideas
    
    Returns insights about potential biases affecting the discussion quality.
    """
    try:
        if len(sorted_ideas) < 10:
            return {
                "biases_detected": [],
                "confidence": "low",
                "reason": "Need at least 10 ideas for bias detection"
            }

        detected_biases = []
        bias_scores = {}

        # 1. ANCHORING BIAS DETECTION
        anchoring_score = await _detect_anchoring_bias(sorted_ideas)
        if anchoring_score > 0.6:
            detected_biases.append({
                "type": "anchoring_bias",
                "severity": "high" if anchoring_score > 0.8 else "medium",
                "description": "Discussion shows strong influence from early ideas",
                "score": anchoring_score,
                "recommendation": "Encourage participants to think independently before seeing others' ideas"
            })
        bias_scores["anchoring"] = anchoring_score

        # 2. GROUPTHINK DETECTION
        groupthink_score = await _detect_groupthink(sorted_ideas)
        if groupthink_score > 0.7:
            detected_biases.append({
                "type": "groupthink",
                "severity": "high" if groupthink_score > 0.85 else "medium", 
                "description": "Low diversity in ideas suggests potential groupthink",
                "score": groupthink_score,
                "recommendation": "Actively encourage contrarian viewpoints and diverse perspectives"
            })
        bias_scores["groupthink"] = groupthink_score

        # 3. CONFIRMATION BIAS DETECTION
        confirmation_score = await _detect_confirmation_bias(sorted_ideas)
        if confirmation_score > 0.6:
            detected_biases.append({
                "type": "confirmation_bias",
                "severity": "high" if confirmation_score > 0.8 else "medium",
                "description": "Ideas tend to reinforce similar themes rather than exploring alternatives",
                "score": confirmation_score,
                "recommendation": "Prompt participants to consider alternative viewpoints"
            })
        bias_scores["confirmation"] = confirmation_score

        # 4. PARTICIPATION INEQUALITY (related to bias)
        participation_gini = _calculate_participation_gini(contributor_counts)
        if participation_gini > 0.6:
            detected_biases.append({
                "type": "participation_inequality",
                "severity": "high" if participation_gini > 0.8 else "medium",
                "description": "Discussion dominated by few contributors",
                "score": participation_gini,
                "recommendation": "Encourage broader participation from quieter members"
            })
        bias_scores["participation_inequality"] = participation_gini

        return {
            "biases_detected": detected_biases,
            "confidence": "high" if len(sorted_ideas) >= 20 else "medium",
            "bias_scores": bias_scores,
            "overall_bias_risk": "high" if len(detected_biases) >= 3 else "medium" if len(detected_biases) >= 1 else "low",
            "insights": {
                "total_biases_found": len(detected_biases),
                "highest_risk_bias": max(detected_biases, key=lambda x: x["score"])["type"] if detected_biases else None,
                "discussion_health": "concerning" if len(detected_biases) >= 3 else "moderate" if len(detected_biases) >= 1 else "healthy"
            }
        }

    except Exception as e:
        logger.error(f"Error in cognitive bias detection: {e}", exc_info=True)
        return {
            "biases_detected": [],
            "error": str(e),
            "confidence": "low"
        }


async def detect_emergence_patterns(sorted_ideas: List[Dict]) -> Dict[str, Any]:
    """
    🌱 EMERGENCE PATTERN RECOGNITION

    Detects when new themes are emerging before they become obvious.
    Early warning system for emerging concerns/opportunities.
    """
    try:
        if len(sorted_ideas) < 8:
            return {
                "emerging_themes": [],
                "confidence": "low",
                "reason": "Need at least 8 ideas for emergence detection"
            }

        # Analyze keyword emergence over time
        time_windows = _create_time_windows(sorted_ideas, num_windows=4)
        keyword_evolution = {}

        for window_idx, window_ideas in enumerate(time_windows):
            if not window_ideas:
                continue

            window_keywords = []
            for idea in window_ideas:
                if idea.get("keywords"):
                    # Filter out technical/development keywords that shouldn't appear in user discussions
                    filtered_keywords = [
                        kw for kw in idea["keywords"]
                        if not any(tech_term in kw.lower() for tech_term in [
                            'genkit', 'api', 'context', 'action', 'function', 'method', 'class',
                            'import', 'export', 'async', 'await', 'promise', 'callback'
                        ])
                    ]
                    window_keywords.extend(filtered_keywords)

            keyword_counts = Counter(window_keywords)
            for keyword, count in keyword_counts.items():
                if keyword not in keyword_evolution:
                    keyword_evolution[keyword] = [0] * len(time_windows)
                keyword_evolution[keyword][window_idx] = count

        # Detect emerging keywords (increasing frequency in later windows)
        emerging_themes = []
        for keyword, counts in keyword_evolution.items():
            if len(counts) >= 3 and sum(counts) >= 3:  # Minimum threshold
                # Filter out technical keywords and very common words
                if any(tech_term in keyword.lower() for tech_term in [
                    'genkit', 'api', 'context', 'action', 'function', 'method', 'class',
                    'import', 'export', 'async', 'await', 'promise', 'callback',
                    'title', 'description', 'discussion'  # Also filter meta-discussion words
                ]):
                    continue

                # Calculate trend (later windows vs earlier windows)
                mid_point = len(counts) // 2
                early_avg = sum(counts[:mid_point]) / max(mid_point, 1)
                late_avg = sum(counts[mid_point:]) / max(len(counts) - mid_point, 1)

                if late_avg > early_avg * 1.5 and late_avg >= 2:  # Emerging pattern
                    emerging_themes.append({
                        "keyword": keyword,
                        "emergence_score": round(late_avg / max(early_avg, 0.1), 2),
                        "frequency_trend": counts,
                        "total_mentions": sum(counts)
                    })

        emerging_themes.sort(key=lambda x: x["emergence_score"], reverse=True)

        return {
            "emerging_themes": emerging_themes[:5],  # Top 5
            "confidence": "high" if len(emerging_themes) >= 2 else "medium",
            "insights": {
                "total_emerging_themes": len(emerging_themes),
                "strongest_emergence": emerging_themes[0]["keyword"] if emerging_themes else None,
                "emergence_detected": len(emerging_themes) > 0
            }
        }

    except Exception as e:
        logger.error(f"Error in emergence pattern detection: {e}", exc_info=True)
        return {
            "emerging_themes": [],
            "error": str(e),
            "confidence": "low"
        }


async def analyze_participation_behaviors(sorted_ideas: List[Dict], contributor_counts: Dict, interactions: List[Dict]) -> Dict[str, Any]:
    """
    👥 PARTICIPATION BEHAVIOR PROFILING

    Identifies different contributor archetypes and their impact patterns.
    """
    try:
        if len(sorted_ideas) < 5 or len(contributor_counts) < 2:
            return {
                "archetypes": [],
                "confidence": "low",
                "reason": "Need at least 5 ideas and 2 contributors for behavior analysis"
            }

        # Analyze contributor patterns
        contributor_profiles = {}

        for idea in sorted_ideas:
            contributor = idea.get("submitter_display_id") or idea.get("user_id", "anonymous")
            if contributor not in contributor_profiles:
                contributor_profiles[contributor] = {
                    "ideas": [],
                    "submission_times": [],
                    "intents": [],
                    "sentiments": []
                }

            contributor_profiles[contributor]["ideas"].append(idea)
            if idea.get("timestamp"):
                contributor_profiles[contributor]["submission_times"].append(idea["timestamp"])
            if idea.get("intent"):
                contributor_profiles[contributor]["intents"].append(idea["intent"])
            if idea.get("sentiment"):
                contributor_profiles[contributor]["sentiments"].append(idea["sentiment"])

        # Classify contributors into archetypes
        archetypes = []

        for contributor, profile in contributor_profiles.items():
            idea_count = len(profile["ideas"])

            # Calculate behavioral metrics
            intent_diversity = len(set(profile["intents"])) / max(len(profile["intents"]), 1)
            sentiment_consistency = 1 - (len(set(profile["sentiments"])) / max(len(profile["sentiments"]), 1))

            # Determine archetype
            if idea_count >= 5:
                if intent_diversity > 0.7:
                    archetype = "Diverse Thinker"
                elif sentiment_consistency > 0.8:
                    archetype = "Consistent Contributor"
                else:
                    archetype = "Power Contributor"
            elif idea_count >= 2:
                archetype = "Regular Participant"
            else:
                archetype = "Casual Contributor"

            archetypes.append({
                "contributor": contributor,
                "archetype": archetype,
                "idea_count": idea_count,
                "intent_diversity": round(intent_diversity, 3),
                "sentiment_consistency": round(sentiment_consistency, 3),
                "dominant_intent": Counter(profile["intents"]).most_common(1)[0][0] if profile["intents"] else None,
                "dominant_sentiment": Counter(profile["sentiments"]).most_common(1)[0][0] if profile["sentiments"] else None
            })

        # Count archetype distribution
        archetype_counts = Counter([a["archetype"] for a in archetypes])

        return {
            "archetypes": archetypes,
            "confidence": "high" if len(archetypes) >= 5 else "medium",
            "archetype_distribution": dict(archetype_counts),
            "insights": {
                "total_contributors": len(archetypes),
                "most_common_archetype": archetype_counts.most_common(1)[0][0] if archetype_counts else None,
                "diversity_score": len(archetype_counts) / max(len(archetypes), 1)
            }
        }

    except Exception as e:
        logger.error(f"Error in participation behavior analysis: {e}", exc_info=True)
        return {
            "archetypes": [],
            "error": str(e),
            "confidence": "low"
        }


# ===== HELPER FUNCTIONS =====

def _create_time_windows(sorted_ideas: List[Dict], num_windows: int = 5) -> List[List[Dict]]:
    """Create time-based windows for temporal analysis."""
    if not sorted_ideas:
        return []

    total_ideas = len(sorted_ideas)
    window_size = max(1, total_ideas // num_windows)

    windows = []
    for i in range(0, total_ideas, window_size):
        window = sorted_ideas[i:i + window_size]
        if window:  # Only add non-empty windows
            windows.append(window)

    return windows


def _detect_evolution_patterns(window_analysis: List[Dict]) -> Dict[str, Any]:
    """Detect patterns in semantic evolution across time windows."""
    if len(window_analysis) < 3:
        return {"convergence_detected": False, "drift_detected": False, "consensus_detected": False}

    # Analyze diversity trends
    intent_diversities = [w["intent_diversity"] for w in window_analysis]
    sentiment_diversities = [w["sentiment_diversity"] for w in window_analysis]

    # Convergence: decreasing diversity over time
    intent_trend = _calculate_trend(intent_diversities)
    sentiment_trend = _calculate_trend(sentiment_diversities)

    convergence_detected = intent_trend < -0.1 or sentiment_trend < -0.1
    drift_detected = intent_trend > 0.2 or sentiment_trend > 0.2

    # Consensus: consistent dominant themes in later windows
    later_windows = window_analysis[-2:]
    consensus_detected = False
    if len(later_windows) >= 2:
        consistent_intent = all(w.get("dominant_intent") == later_windows[0].get("dominant_intent")
                              for w in later_windows if w.get("dominant_intent"))
        consistent_sentiment = all(w.get("dominant_sentiment") == later_windows[0].get("dominant_sentiment")
                                 for w in later_windows if w.get("dominant_sentiment"))
        consensus_detected = consistent_intent and consistent_sentiment

    return {
        "convergence_detected": convergence_detected,
        "drift_detected": drift_detected,
        "consensus_detected": consensus_detected,
        "intent_trend": round(intent_trend, 3),
        "sentiment_trend": round(sentiment_trend, 3)
    }


def _calculate_trend(values: List[float]) -> float:
    """Calculate linear trend in a series of values."""
    if len(values) < 2:
        return 0.0

    n = len(values)
    x_mean = (n - 1) / 2
    y_mean = sum(values) / n

    numerator = sum((i - x_mean) * (values[i] - y_mean) for i in range(n))
    denominator = sum((i - x_mean) ** 2 for i in range(n))

    return numerator / denominator if denominator != 0 else 0.0


def _calculate_idea_similarity(idea1: Dict, idea2: Dict) -> float:
    """Calculate similarity between two ideas based on keywords and semantic features."""
    # Keyword overlap
    keywords1 = set(idea1.get("keywords", []))
    keywords2 = set(idea2.get("keywords", []))

    if not keywords1 and not keywords2:
        keyword_similarity = 0.0
    elif not keywords1 or not keywords2:
        keyword_similarity = 0.0
    else:
        intersection = len(keywords1.intersection(keywords2))
        union = len(keywords1.union(keywords2))
        keyword_similarity = intersection / union if union > 0 else 0.0

    # Intent and sentiment similarity
    intent_similarity = 1.0 if idea1.get("intent") == idea2.get("intent") else 0.0
    sentiment_similarity = 1.0 if idea1.get("sentiment") == idea2.get("sentiment") else 0.0

    # Weighted combination
    return (keyword_similarity * 0.6 + intent_similarity * 0.2 + sentiment_similarity * 0.2)


async def _detect_anchoring_bias(sorted_ideas: List[Dict]) -> float:
    """Detect anchoring bias by analyzing influence of early ideas."""
    if len(sorted_ideas) < 5:
        return 0.0

    # Compare first 20% of ideas with rest
    split_point = max(2, len(sorted_ideas) // 5)
    early_ideas = sorted_ideas[:split_point]
    later_ideas = sorted_ideas[split_point:]

    # Extract themes from early ideas
    early_keywords = []
    early_intents = []
    for idea in early_ideas:
        if idea.get("keywords"):
            early_keywords.extend(idea["keywords"])
        if idea.get("intent"):
            early_intents.append(idea["intent"])

    early_keyword_set = set(early_keywords)
    early_intent_set = set(early_intents)

    # Check how much later ideas overlap with early themes
    overlap_scores = []
    for idea in later_ideas:
        idea_keywords = set(idea.get("keywords", []))
        idea_intent = idea.get("intent")

        keyword_overlap = len(idea_keywords.intersection(early_keyword_set)) / max(len(idea_keywords), 1)
        intent_overlap = 1.0 if idea_intent in early_intent_set else 0.0

        overlap_scores.append((keyword_overlap * 0.7 + intent_overlap * 0.3))

    return statistics.mean(overlap_scores) if overlap_scores else 0.0


async def _detect_groupthink(sorted_ideas: List[Dict]) -> float:
    """Detect groupthink by analyzing diversity of perspectives."""
    if len(sorted_ideas) < 5:
        return 0.0

    # Analyze diversity metrics
    all_intents = [idea.get("intent") for idea in sorted_ideas if idea.get("intent")]
    all_sentiments = [idea.get("sentiment") for idea in sorted_ideas if idea.get("sentiment")]
    all_keywords = []
    for idea in sorted_ideas:
        if idea.get("keywords"):
            all_keywords.extend(idea["keywords"])

    # Calculate diversity scores (lower diversity = higher groupthink)
    intent_diversity = len(set(all_intents)) / max(len(all_intents), 1) if all_intents else 0
    sentiment_diversity = len(set(all_sentiments)) / max(len(all_sentiments), 1) if all_sentiments else 0
    keyword_diversity = len(set(all_keywords)) / max(len(all_keywords), 1) if all_keywords else 0

    # Groupthink score (inverse of diversity)
    avg_diversity = (intent_diversity + sentiment_diversity + keyword_diversity) / 3
    return 1.0 - avg_diversity


async def _detect_confirmation_bias(sorted_ideas: List[Dict]) -> float:
    """Detect confirmation bias by analyzing theme reinforcement patterns."""
    if len(sorted_ideas) < 5:
        return 0.0

    # Group ideas by similar themes
    theme_groups = defaultdict(list)

    for idea in sorted_ideas:
        # Create theme signature from intent + dominant keywords
        intent = idea.get("intent", "unknown")
        keywords = idea.get("keywords", [])
        top_keywords = sorted(keywords)[:2] if keywords else []
        theme_signature = f"{intent}_{'-'.join(top_keywords)}"
        theme_groups[theme_signature].append(idea)

    # Calculate reinforcement patterns
    reinforcement_scores = []
    for theme, ideas in theme_groups.items():
        if len(ideas) >= 3:  # Need at least 3 ideas for reinforcement pattern
            # Check if ideas in this theme are temporally clustered
            timestamps = [idea.get("timestamp") for idea in ideas if idea.get("timestamp")]
            if len(timestamps) >= 2:
                timestamps.sort()
                # Calculate temporal clustering (ideas submitted close together)
                time_gaps = [(timestamps[i+1] - timestamps[i]).total_seconds() / 3600
                           for i in range(len(timestamps)-1)]
                avg_gap = statistics.mean(time_gaps)
                # Shorter gaps indicate reinforcement behavior
                reinforcement_score = max(0, 1.0 - (avg_gap / 24))  # Normalize to 24 hours
                reinforcement_scores.append(reinforcement_score)

    return statistics.mean(reinforcement_scores) if reinforcement_scores else 0.0


def _calculate_participation_gini(contributor_counts: Dict) -> float:
    """Calculate Gini coefficient for participation inequality."""
    if not contributor_counts:
        return 0.0

    counts = list(contributor_counts.values())
    counts.sort()
    n = len(counts)

    if n == 1:
        return 0.0

    # Calculate Gini coefficient
    cumsum = 0
    for i, count in enumerate(counts):
        cumsum += count * (2 * i - n + 1)

    total_sum = sum(counts)
    gini = cumsum / (n * total_sum) if total_sum > 0 else 0.0

    return abs(gini)
