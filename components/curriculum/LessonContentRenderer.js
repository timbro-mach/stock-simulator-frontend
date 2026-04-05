import React, { useMemo } from 'react';

const shellStyle = {
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  borderRadius: 8,
  padding: '16px clamp(12px, 2vw, 24px)',
  maxHeight: 420,
  overflowY: 'auto',
};

const contentColumnStyle = {
  maxWidth: 780,
  margin: '0 auto',
  display: 'grid',
  gap: 14,
  color: '#0f172a',
};

const paragraphStyle = {
  margin: 0,
  lineHeight: 1.75,
  fontSize: '0.98rem',
};

const listStyle = {
  margin: 0,
  paddingLeft: '1.5rem',
  display: 'grid',
  gap: 8,
  lineHeight: 1.7,
};

const headingStyles = {
  large: {
    margin: 0,
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
    fontWeight: 700,
    color: '#0b63b6',
    fontSize: 'clamp(1.25rem, 1.4vw, 1.7rem)',
  },
  section: {
    margin: '4px 0 0',
    lineHeight: 1.35,
    letterSpacing: '-0.005em',
    fontWeight: 650,
    color: '#134074',
    fontSize: 'clamp(1.05rem, 1.2vw, 1.28rem)',
  },
  small: {
    margin: '2px 0 0',
    lineHeight: 1.45,
    fontWeight: 650,
    color: '#1e3a8a',
    fontSize: '1rem',
  },
};

const htmlContainerStyle = {
  lineHeight: 1.75,
  fontSize: '0.98rem',
};

const toText = (value) => (typeof value === 'string' ? value : '');

export const parseInlineEmphasis = (text) => {
  const source = toText(text);
  if (!source.includes('**')) return [source];

  const segments = source.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return React.createElement('strong', { key: `strong-${index}` }, segment.slice(2, -2));
    }
    return React.createElement(React.Fragment, { key: `text-${index}` }, segment);
  });
};

const renderHeading = (level, text, key) => {
  const safeLevel = Math.min(6, Math.max(1, Number(level) || 2));
  const tagName = `h${safeLevel}`;
  const style = safeLevel <= 2 ? headingStyles.large : (safeLevel <= 4 ? headingStyles.section : headingStyles.small);
  return React.createElement(tagName, { key, style }, parseInlineEmphasis(text));
};

const renderBlock = (block, index) => {
  if (!block || typeof block !== 'object') return null;

  if (block.type === 'heading') {
    return renderHeading(block.level, block.text, `heading-${index}`);
  }

  if (block.type === 'paragraph') {
    return React.createElement('p', { key: `paragraph-${index}`, style: paragraphStyle }, parseInlineEmphasis(block.text));
  }

  if (block.type === 'list' && Array.isArray(block.items)) {
    return React.createElement(
      'ul',
      { key: `list-${index}`, style: listStyle },
      block.items.map((item, itemIndex) => React.createElement('li', { key: `list-item-${index}-${itemIndex}` }, parseInlineEmphasis(item))),
    );
  }

  return null;
};

const hasRenderableBlocks = (blocks) => Array.isArray(blocks) && blocks.length > 0;

const sanitizeHtml = (html) => {
  const input = toText(html);
  if (!input) return '';

  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/on[a-z]+\s*=\s*(["']).*?\1/gi, '')
    .replace(/on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
};

const rawFallbackStyle = {
  ...paragraphStyle,
  whiteSpace: 'pre-wrap',
};

const LessonContentRenderer = ({ blocks, html, raw }) => {
  const sanitizedHtml = useMemo(() => {
    if (hasRenderableBlocks(blocks)) return '';
    if (!toText(html).trim()) return '';
    return sanitizeHtml(html);
  }, [blocks, html]);

  return React.createElement(
    'div',
    { style: shellStyle },
    React.createElement(
      'div',
      { style: contentColumnStyle },
      hasRenderableBlocks(blocks)
        ? blocks.map((block, index) => renderBlock(block, index)).filter(Boolean)
        : sanitizedHtml
          ? React.createElement('div', {
            style: htmlContainerStyle,
            dangerouslySetInnerHTML: { __html: sanitizedHtml },
          })
          : React.createElement('p', { style: rawFallbackStyle }, toText(raw) || 'Lesson content has not been published yet.'),
    ),
  );
};

export default LessonContentRenderer;
