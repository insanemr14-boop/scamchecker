import React, { useState, useRef } from 'react';
import './CreditCard3D.css';

const CreditCard3D = () => {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    
    const { left, top, width, height } = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - left - width / 2) / (width / 2);
    const y = (e.clientY - top - height / 2) / (height / 2);
    
    // Limit rotation to prevent extreme angles
    const maxRotation = 15;
    const rotateX = Math.max(-Math.min(y * maxRotation, maxRotation), -maxRotation);
    const rotateY = Math.max(-Math.min(x * maxRotation, maxRotation), -maxRotation);
    
    setRotateX(rotateX);
    setRotateY(rotateY);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
    setIsHovered(false);
  };

  return (
    <div 
      className="card-container" 
      ref={cardRef}
      onMouseMove={handleMouseMove} 
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseMove}
      onTouchEnd={handleMouseLeave}
    >
      <div 
        className="card"
        style={{
          '--rotate-x': `${rotateX}deg`,
          '--rotate-y': `${rotateY}deg`
        }}
      >
        {/* Front of card */}
        <div className="card-face front">
          <div className="card-content">
            <div className="chip">
              {/* Chip icon */}
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4H20V20H4V4Z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 8H16V16H8V8Z" fill="currentColor" opacity="0.2"/>
              </svg>
            </div>
            <div className="card-number">**** **** **** 1234</div>
            <div className="card-details">
              <div className="card-holder">JOHN DOE</div>
              <div className="card-expiry">
                <span>01/25</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Back of card */}
        <div className="card-face back">
          <div className="magnetic-strip"></div>
          <div className="card-back-content">
            <div className="cvc">CVC</div>
            <div className="cvc-code">123</div>
            <div className="card-network">
              <span>VISA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditCard3D;
