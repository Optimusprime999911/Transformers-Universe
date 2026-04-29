// starfield.js - Canvas-based falling stars background effect
(function() {
  function initStarfield() {
    // Wait for body to fully exist
    const body = document.body;
    if (!body) {
      setTimeout(initStarfield, 100);
      return;
    }
    
    try {
      // Create canvas element
      const canvas = document.createElement("canvas");
      canvas.id = "starfield-canvas";
      
      // Set canvas styles directly
      canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;";
      
      // Insert at very beginning of body
      if (body.firstChild) {
        body.insertBefore(canvas, body.firstChild);
      } else {
        body.appendChild(canvas);
      }
      
      // Get rendering context
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        console.error("Could not get canvas context");
        return;
      }
      
      let stars = [];
      
      function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        createStars(Math.round((canvas.width * canvas.height) / 8000));
      }
      
      function createStars(count) {
        stars = [];
        for (let i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + 0.2,
            speed: Math.random() * 0.6 + 0.05,
            twinkle: Math.random() * 1.5
          });
        }
      }
      
      function animateStars() {
        // Fill background
        ctx.fillStyle = "#0d0d0d";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw stars
        for (let s of stars) {
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 1000 * s.twinkle);
          ctx.fillStyle = "#bfefff";
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
          
          // Move star down
          s.y += s.speed;
          
          // Reset if below screen
          if (s.y > canvas.height + 10) {
            s.y = -10;
            s.x = Math.random() * canvas.width;
          }
        }
        
        ctx.globalAlpha = 1;
        requestAnimationFrame(animateStars);
      }
      
      // Resize on window changes
      window.addEventListener("resize", resizeCanvas);
      
      // Initial setup
      resizeCanvas();
      animateStars();
      
      console.log("✓ Starfield initialized");
    } catch (e) {
      console.error("Starfield error:", e);
    }
  }
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStarfield);
  } else {
    initStarfield();
  }
})();
