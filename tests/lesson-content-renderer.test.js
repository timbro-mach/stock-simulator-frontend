import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import LessonContentRenderer from '../components/curriculum/LessonContentRenderer.js';

const renderMarkup = (props) => renderToStaticMarkup(React.createElement(LessonContentRenderer, props));

test('renders heading, paragraph, and list blocks with semantic tags', () => {
  const markup = renderMarkup({
    blocks: [
      { type: 'heading', level: 2, text: 'Market Basics' },
      { type: 'paragraph', text: 'Learn how prices move.' },
      { type: 'list', items: ['Supply and demand', 'Liquidity'] },
    ],
  });

  assert.match(markup, /<h2[^>]*>Market Basics<\/h2>/);
  assert.match(markup, /<p[^>]*>Learn how prices move\.<\/p>/);
  assert.match(markup, /<ul[^>]*>/);
  assert.match(markup, /<li>Supply and demand<\/li>/);
  assert.match(markup, /<li>Liquidity<\/li>/);
});

test('falls back to sanitized html when blocks are unavailable', () => {
  const markup = renderMarkup({
    html: '<h3>Rendered HTML</h3><p>Body</p><script>alert(1)</script>',
  });

  assert.match(markup, /<h3>Rendered HTML<\/h3>/);
  assert.match(markup, /<p>Body<\/p>/);
  assert.doesNotMatch(markup, /<script>/);
});

test('falls back to raw plain text when blocks and html are unavailable', () => {
  const markup = renderMarkup({
    raw: 'Plain text lesson fallback',
  });

  assert.match(markup, /Plain text lesson fallback/);
  assert.doesNotMatch(markup, /<h1>|<h2>|<ul>|<li>/);
});

test('snapshot: block rendering has stable typography wrapper structure', () => {
  const markup = renderMarkup({
    blocks: [
      { type: 'heading', level: 1, text: 'Week 1' },
      { type: 'paragraph', text: 'This is **important**.' },
      { type: 'list', items: ['One', 'Two'] },
    ],
    html: '<p>ignored fallback html</p>',
    raw: 'ignored raw',
  });

  assert.equal(
    markup,
    '<div style="border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:16px clamp(12px, 2vw, 24px);max-height:420px;overflow-y:auto"><div style="max-width:780px;margin:0 auto;display:grid;gap:14px;color:#0f172a"><h1 style="margin:0;line-height:1.3;letter-spacing:-0.01em;font-weight:700;color:#0b63b6;font-size:clamp(1.25rem, 1.4vw, 1.7rem)">Week 1</h1><p style="margin:0;line-height:1.75;font-size:0.98rem">This is <strong>important</strong>.</p><ul style="margin:0;padding-left:1.5rem;display:grid;gap:8px;line-height:1.7"><li>One</li><li>Two</li></ul></div></div>',
  );
});
