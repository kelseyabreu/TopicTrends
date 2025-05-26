// File: src/pages/CreateDiscussion.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import '../styles/CreateDiscussion.css';
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input"
import api from "../utils/api";

function CreateDiscussion() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [requireVerification, setRequireVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title) {
        toast.error('Please enter a discussion title');
        return;
    }

    if (!prompt) {
        toast.error('Please enter a discussion prompt');
        return;
    }

    if (prompt.length > 200) {
        toast.error('Discussion prompt exceeds maximum length of 200 characters');
        return;
    }

    setIsSubmitting(true);

    try {
        const response = await api.post('/discussions', {
            title,
            prompt,
            require_verification: requireVerification
        });

        toast.success('Discussion created successfully!');
        navigate(`/discussion/${response.data.id}`);
    } catch (error) {
        console.error('Error creating discussion:', error);
        toast.error('Failed to create discussion. Please try again.');
    } finally {
        setIsSubmitting(false);
    }
};
  
  return (
    <div className="create-discussion-container">
      
      <div className="create-form-container">
        <h1>Create a Discussion</h1>
        <p>Set up a new discussion to collect and organize ideas from participants.</p>
        
        <form onSubmit={handleSubmit} className="create-form">
          <div>
            <label htmlFor="title">Discussion Title*</label>
            <Input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Park Improvement Ideas"
              required
            />
          </div>
          
          <div>
            <label htmlFor="prompt">Discussion Prompt*</label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., What changes would you like to see in our park?"
              required
            />
            <small>{prompt.length}/200 characters</small>
          </div>
          
          <div className="form-group checkbox-group">
            <input
              type="checkbox"
              id="require-verification"
              checked={requireVerification}
              onChange={(e) => setRequireVerification(e.target.checked)}
            />
            <label htmlFor="require-verification">
              Require identity verification (optional)
            </label>
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Discussion'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CreateDiscussion;