// File: src/pages/CreateSession.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import '../styles/CreateSession.css';
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input"
import api from "../utils/api";

function CreateSession() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [requireVerification, setRequireVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title || !prompt) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const response = await api.post('/api/sessions', {
        title,
        prompt,
        require_verification: requireVerification
      });
      
      toast.success('Discussion created successfully!');
      navigate(`/session/${response.data.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create discussion. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="create-session-container">
      
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

export default CreateSession;