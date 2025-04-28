/**
 * Enumeration of possible intents behind a submitted idea.
 * This should mirror the backend Python Enum.
 * Using string values is recommended for clarity when receiving data from the API.
 */
export enum IntentType {
    // --- Core Idea/Content Types ---
    Opinion = 'opinion',                                // Expressing a belief, feeling, or judgment.
    Suggestion = 'suggestion',                          // Offering a possible course of action or idea, often informal.
    Proposal = 'proposal',                              // Presenting a more formal or detailed plan for action.
    Information = 'information',                        // Stating facts, data, or objective observations.
    Clarification = 'clarification',                    // Explaining or re-stating a previous point to reduce ambiguity.
    Problem_Identification = 'problem_identification',  // Highlighting a specific problem, issue, or unmet need.
    Personal_Experience = 'personal_experience',        // Sharing a relevant personal story or observation.

    // --- Action, Advocacy & Vision ---
    Call_To_Action = 'call_to_action',                  // Urging others (or the organization) to take specific action.
    Advocacy = 'advocacy',                              // Speaking on behalf of or advocating for a group, cause, or principle.
    Vision = 'vision',                                  // Describing a desired future state or long-term aspiration.
    Hypothetical = 'hypothetical',                      // Exploring potential "what if" scenarios or possibilities.
    Request = 'request',                                // Asking someone (esp. authority) to perform an action (can range from polite to demanding).
    Warning = 'warning',                                // Alerting others to potential risks or negative consequences.

    // --- Interaction & Feedback ---
    Question = 'question',                              // Asking for information, clarification, or feedback.
    Complaint = 'complaint',                            // Expressing dissatisfaction or unhappiness; focus is on negative feeling/experience.
    Criticism = 'criticism',                            // Evaluating something negatively, pointing out flaws (can range from constructive to hostile).
    Praise = 'praise',                                  // Expressing positive feedback, appreciation, or approval.
    Agreement = 'agreement',                            // Expressing agreement with or support for an idea, person, or group.
    Disagreement = 'disagreement',                      // Expressing disagreement with or opposition to an idea or position.
    Defense = 'defense',                                // Arguing against criticism/complaint, justifying a position or action.

    // --- Meta/Status Types ---
    Unclear = 'unclear',                                // The primary intent cannot be reliably determined from the text.
    Off_Topic = 'off_topic',                            // The content is not relevant to the designated topic of discussion.
}