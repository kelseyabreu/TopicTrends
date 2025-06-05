import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Lightbulb, Waves, Loader2, Settings, Minus, Plus } from 'lucide-react';
import ideaBank from '../data/orlandoImprovementIdeas.json';
import '../styles/IdeaSimulator.css';

export interface GeneratedIdea {
  id: string;
  text: string;
  author: string;
  timestamp: string;
}

interface IdeaSimulatorProps {
  onIdeaCountChange?: (count: number) => void;
  onFloodGatesOpen?: () => void;
  onIdeasGenerated?: (ideas: GeneratedIdea[]) => void;
  disabled?: boolean;
}

export const IdeaSimulator: React.FC<IdeaSimulatorProps> = ({
  onIdeaCountChange,
  onFloodGatesOpen,
  onIdeasGenerated,
  disabled = false
}) => {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragStartTime, setDragStartTime] = useState(0);
  const [dragDistance, setDragDistance] = useState(0);
  const [isCollecting, setIsCollecting] = useState(false);
  const [ideaCount, setIdeaCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<'collect' | 'submit'>('collect');

  // New controls
  const [targetIdeaCount, setTargetIdeaCount] = useState(0);
  const [speed, setSpeed] = useState(1); // 1x, 2x, 5x, 10x
  const [showControls, setShowControls] = useState(false);

  // Settings button drag state (moves the whole simulator)
  const [isSettingsDragging, setIsSettingsDragging] = useState(false);
  const [settingsDragOffset, setSettingsDragOffset] = useState({ x: 0, y: 0 });
  const [settingsDragStartTime, setSettingsDragStartTime] = useState(0);
  const [settingsDragDistance, setSettingsDragDistance] = useState(0);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Generate ideas from the Orlando idea bank
  const generateIdeas = (count: number): GeneratedIdea[] => {
    const ideas: GeneratedIdea[] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < count; i++) {
      let randomIndex: number;

      // Ensure we don't duplicate ideas (unless we run out)
      if (usedIndices.size >= ideaBank.length) {
        usedIndices.clear(); // Reset if we've used all ideas
      }

      do {
        randomIndex = Math.floor(Math.random() * ideaBank.length);
      } while (usedIndices.has(randomIndex));

      usedIndices.add(randomIndex);

      const ideaText = ideaBank[randomIndex];

      ideas.push({
        id: `sim-${Date.now()}-${i}-${randomIndex}`,
        text: ideaText,
        author: 'Idea Simulator',
        timestamp: new Date().toISOString()
      });
    }

    return ideas;
  };

  // Handle idea collection simulation with smooth animation
  useEffect(() => {
    if (isCollecting && !isSubmitting) {
      intervalRef.current = setInterval(() => {
        setIdeaCount(prev => {
          // Speed multiplier: 0.1 * speed ideas per 100ms
          const increment = 0.1 * speed;
          const newCount = prev + increment;

          // Use setTimeout to avoid setState during render
          setTimeout(() => onIdeaCountChange?.(newCount), 0);
          return newCount;
        });
      }, 100); // 10 updates per second for smooth animation
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isCollecting, isSubmitting, onIdeaCountChange, speed]);

  // Settings button drag handlers
  const handleSettingsMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;

    // Calculate offset relative to the main button position, not the settings button
    const mainButtonRect = buttonRef.current?.getBoundingClientRect();
    if (mainButtonRect) {
      setSettingsDragOffset({
        x: e.clientX - mainButtonRect.left,
        y: e.clientY - mainButtonRect.top
      });
      setSettingsDragStartTime(Date.now());
      setSettingsDragDistance(0);
      setIsSettingsDragging(true);
    }
  };

  const handleSettingsTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;

    // Calculate offset relative to the main button position, not the settings button
    const mainButtonRect = buttonRef.current?.getBoundingClientRect();
    const touch = e.touches[0];
    if (mainButtonRect && touch) {
      setSettingsDragOffset({
        x: touch.clientX - mainButtonRect.left,
        y: touch.clientY - mainButtonRect.top
      });
      setSettingsDragStartTime(Date.now());
      setSettingsDragDistance(0);
      setIsSettingsDragging(true);
    }
  };

  // Handle mouse/touch events for main button dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setDragStartTime(Date.now());
      setDragDistance(0);
      setIsDragging(true);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;

    const rect = buttonRef.current?.getBoundingClientRect();
    const touch = e.touches[0];
    if (rect && touch) {
      setDragOffset({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      });
      setDragStartTime(Date.now());
      setDragDistance(0);
      setIsDragging(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Calculate drag distance for click resistance
        const currentDistance = Math.sqrt(
          Math.pow(newX - position.x, 2) + Math.pow(newY - position.y, 2)
        );
        setDragDistance(prev => Math.max(prev, currentDistance));

        // Constrain to viewport
        const maxX = window.innerWidth - 80; // Button width
        const maxY = window.innerHeight - 80; // Button height

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }

      if (isSettingsDragging) {
        const newX = e.clientX - settingsDragOffset.x;
        const newY = e.clientY - settingsDragOffset.y;

        // Calculate drag distance for click resistance
        const currentDistance = Math.sqrt(
          Math.pow(newX - position.x, 2) + Math.pow(newY - position.y, 2)
        );
        setSettingsDragDistance(prev => Math.max(prev, currentDistance));

        // Constrain to viewport - move the entire simulator
        const maxX = window.innerWidth - 80; // Button width
        const maxY = window.innerHeight - 80; // Button height

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging) {
        const touch = e.touches[0];
        const newX = touch.clientX - dragOffset.x;
        const newY = touch.clientY - dragOffset.y;

        // Calculate drag distance for click resistance
        const currentDistance = Math.sqrt(
          Math.pow(newX - position.x, 2) + Math.pow(newY - position.y, 2)
        );
        setDragDistance(prev => Math.max(prev, currentDistance));

        // Constrain to viewport
        const maxX = window.innerWidth - 80;
        const maxY = window.innerHeight - 80;

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }

      if (isSettingsDragging) {
        const touch = e.touches[0];
        const newX = touch.clientX - settingsDragOffset.x;
        const newY = touch.clientY - settingsDragOffset.y;

        // Calculate drag distance for click resistance
        const currentDistance = Math.sqrt(
          Math.pow(newX - position.x, 2) + Math.pow(newY - position.y, 2)
        );
        setSettingsDragDistance(prev => Math.max(prev, currentDistance));

        // Constrain to viewport - move the entire simulator
        const maxX = window.innerWidth - 80;
        const maxY = window.innerHeight - 80;

        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsSettingsDragging(false);
    };

    if (isDragging || isSettingsDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, isSettingsDragging, dragOffset, settingsDragOffset, position]);

  const handleSettingsClick = () => {
    if (disabled) return;

    // Drag resistance: prevent click if user dragged too far or too long
    const dragTime = Date.now() - settingsDragStartTime;
    const isDragAction = settingsDragDistance > 5 || dragTime > 200;

    if (isDragAction) {
      console.log('Settings click prevented due to drag action:', { settingsDragDistance, dragTime });
      return;
    }

    setShowControls(!showControls);
  };

  const handleClick = async () => {
    if (disabled) return;

    // Drag resistance: prevent click if user dragged too far or too long
    const dragTime = Date.now() - dragStartTime;
    const isDragAction = dragDistance > 5 || dragTime > 200; // 5px threshold or 200ms threshold

    if (isDragAction) {
      console.log('Click prevented due to drag action:', { dragDistance, dragTime });
      return;
    }

    if (phase === 'collect') {
      // Start collecting ideas
      setIsCollecting(true);
      setPhase('submit');
    } else {
      // Open flood gates - generate and submit actual ideas
      setIsSubmitting(true);
      onFloodGatesOpen?.();

      // Generate actual ideas from the Orlando idea bank
      const numberOfIdeas = Math.floor(ideaCount);
      const generatedIdeas = generateIdeas(numberOfIdeas);

      // Pass the generated ideas to the parent component for submission
      onIdeasGenerated?.(generatedIdeas);

      // Simulate submission process
      setTimeout(() => {
        setIsSubmitting(false);
        setIsCollecting(false);
        setIdeaCount(0);
        setPhase('collect');
        onIdeaCountChange?.(0);
      }, 3000); // 3 second submission simulation
    }
  };

  const getButtonText = () => {
    if (isSubmitting) return 'Submitting...';
    if (phase === 'collect') return 'Fill with ideas';
    return 'Open the flood gates';
  };

  const getButtonIcon = () => {
    if (isSubmitting) return <Loader2 className="w-5 h-5 animate-spin" />;
    if (phase === 'collect') return <Lightbulb className="w-5 h-5" />;
    return <Waves className="w-5 h-5" />;
  };

  // Calculate button fill percentage (always 0-100 ideas fills the button)
  const getButtonFillStyle = (): React.CSSProperties => {
    if (isSubmitting) return { '--button-fill-height': '100%' } as React.CSSProperties;

    // Button fills from 0-100 ideas (1% per idea)
    const fillPercentage = Math.min(ideaCount, 100);
    return { '--button-fill-height': `${fillPercentage.toFixed(1)}%` } as React.CSSProperties;
  };

  return (
    <div
      className="idea-simulator-container"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <Button
        ref={buttonRef}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        disabled={disabled}
        className={`idea-simulator-button ${isDragging ? 'dragging' : ''} ${isCollecting ? 'collecting' : ''}`}
        variant="default"
        style={getButtonFillStyle()}
      >
        <div className="button-content">
          <div className="button-top">
            {getButtonIcon()}
            <span className="button-text">{getButtonText()}</span>
          </div>
          {isCollecting && (
            <div className="button-counter">{Math.floor(ideaCount)} ideas</div>
          )}
        </div>
      </Button>

      {/* Controls Panel */}
      <div className="simulator-controls">
        <Button
          ref={settingsRef}
          variant="default"
          size="sm"
          onClick={handleSettingsClick}
          onMouseDown={handleSettingsMouseDown}
          onTouchStart={handleSettingsTouchStart}
          className={`controls-toggle ${isSettingsDragging ? 'dragging' : ''}`}
        >
          <Settings className="w-4 h-4" />
        </Button>

        {showControls && (
          <div className="controls-panel">
            {/* Target Count Control */}
            <div className="control-group">
              <label className="control-label">Ideas Count</label>
              <div className="control-input">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setTargetIdeaCount(Math.max(0, targetIdeaCount - 10))}
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="control-value">{targetIdeaCount}</span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setTargetIdeaCount(Math.min(500, targetIdeaCount + 10))}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Speed Control */}
            <div className="control-group">
              <label className="control-label">Speed</label>
              <div className="control-buttons">
                {[1, 2, 5, 10].map((speedOption) => (
                  <Button
                    key={speedOption}
                    variant={speed === speedOption ? "default" : "neutral"}
                    size="sm"
                    onClick={() => setSpeed(speedOption)}
                    className="speed-button"
                  >
                    {speedOption}x
                  </Button>
                ))}
              </div>
            </div>

            {/* Set Button - applies both count and speed */}
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setIdeaCount(targetIdeaCount);
                setIsCollecting(true);
                setPhase('submit');
                setShowControls(false); // Close controls panel
                onIdeaCountChange?.(targetIdeaCount);
              }}
              className="set-button"
            >
              Set ({targetIdeaCount} ideas @ {speed}x speed)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default IdeaSimulator;
