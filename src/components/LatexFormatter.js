import React, { useEffect, useRef } from 'react';

function LatexFormatter({ content, displayMode = true }) {
  const outputRef = useRef(null);

  useEffect(() => {
    if (content && outputRef.current) {
      try {
        window.katex.render(content, outputRef.current, {
          throwOnError: false,
          errorColor: '#cc0000',
          displayMode
        });
      } catch (err) {
        outputRef.current.innerHTML = `<span style="color: #cc0000">Error: ${err.message}</span>`;
      }
    }
  }, [content, displayMode]);

  return <span ref={outputRef} className="latex-output" />;
}

export default LatexFormatter; 