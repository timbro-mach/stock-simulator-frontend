import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssignmentPayloadContent,
  buildInitialAssignmentDraft,
  nextQuestionId,
  nextSectionId,
  validateAssignmentDraft,
} from '../lib/curriculum/assignmentPrompts.js';

test('buildInitialAssignmentDraft preserves existing question and section ids', () => {
  const draft = buildInitialAssignmentDraft({
    instructions: 'Analyze the case.',
    questions: [
      {
        id: 'a1',
        prompt: 'Explain the trade',
        sections: [
          { id: 'a', instruction: 'Describe the thesis.' },
          { id: 'b', instruction: 'Identify the risk.' },
        ],
        points: 10,
        kind: 'qualitative',
      },
    ],
    rubricHints: ['Cite data.'],
  });

  assert.equal(draft.instructions, 'Analyze the case.');
  assert.equal(draft.questions.length, 1);
  assert.equal(draft.questions[0].id, 'a1');
  assert.equal(draft.questions[0].existing, true);
  assert.equal(draft.questions[0].points, 10);
  assert.equal(draft.questions[0].kind, 'qualitative');
  assert.equal(draft.questions[0].sections[0].id, 'a');
  assert.equal(draft.questions[0].sections[0].existing, true);
  assert.equal(draft.questions[0].sections[1].id, 'b');
  assert.deepEqual(draft.rubricHints, ['Cite data.']);
});

test('buildInitialAssignmentDraft tolerates legacy parts-based shape', () => {
  const draft = buildInitialAssignmentDraft({
    instructions: 'Legacy.',
    questions: [
      {
        id: 'a1',
        prompt: 'Old',
        parts: [
          { id: 'a', prompt: 'first' },
          { id: 'b', text: 'second' },
        ],
      },
    ],
  });
  assert.equal(draft.questions[0].sections.length, 2);
  assert.equal(draft.questions[0].sections[0].instruction, 'first');
  assert.equal(draft.questions[0].sections[1].instruction, 'second');
});

test('nextQuestionId returns fresh a-prefixed id based on existing', () => {
  assert.equal(nextQuestionId([{ id: 'a1' }, { id: 'a2' }]), 'a3');
  assert.equal(nextQuestionId([]), 'a1');
  assert.equal(nextQuestionId([{ id: 'a5' }, { id: 'a2' }]), 'a6');
});

test('nextSectionId returns next unused lowercase letter', () => {
  assert.equal(nextSectionId([]), 'a');
  assert.equal(nextSectionId([{ id: 'a' }]), 'b');
  assert.equal(nextSectionId([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), 'd');
});

test('buildAssignmentPayloadContent shapes to API contract', () => {
  const content = buildAssignmentPayloadContent({
    instructions: '  Analyze.  ',
    questions: [
      {
        id: 'a1',
        prompt: '  Explain  ',
        sections: [
          { id: 'a', instruction: ' thesis ', existing: true },
          { id: 'b', instruction: 'risk', existing: false },
        ],
        points: 10,
        kind: 'qualitative',
        existing: true,
      },
    ],
    rubricHints: ['   Be concise.   ', ''],
  });

  assert.deepEqual(content, {
    instructions: 'Analyze.',
    questions: [
      {
        id: 'a1',
        prompt: 'Explain',
        sections: [
          { id: 'a', instruction: 'thesis' },
          { id: 'b', instruction: 'risk' },
        ],
        points: 10,
        kind: 'qualitative',
      },
    ],
    rubricHints: ['Be concise.'],
  });
});

test('buildAssignmentPayloadContent omits optional fields when unset', () => {
  const content = buildAssignmentPayloadContent({
    instructions: 'A',
    questions: [
      { id: 'a1', prompt: 'P', sections: [{ id: 'a', instruction: 'x' }], points: null, kind: '' },
    ],
    rubricHints: [],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(content, 'rubricHints'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(content.questions[0], 'points'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(content.questions[0], 'kind'), false);
});

test('validateAssignmentDraft rejects empty instructions and questions', () => {
  assert.ok(validateAssignmentDraft({ instructions: '', questions: [] }));
  assert.match(
    validateAssignmentDraft({
      instructions: 'ok',
      questions: [{ id: 'a1', prompt: '', sections: [] }],
    }),
    /prompt cannot be empty/,
  );
  assert.match(
    validateAssignmentDraft({
      instructions: 'ok',
      questions: [
        {
          id: 'a1',
          prompt: 'p',
          sections: [{ id: 'a', instruction: '' }],
        },
      ],
    }),
    /cannot be empty/,
  );
});

test('validateAssignmentDraft flags duplicate ids', () => {
  assert.match(
    validateAssignmentDraft({
      instructions: 'ok',
      questions: [
        { id: 'a1', prompt: 'p', sections: [] },
        { id: 'a1', prompt: 'q', sections: [] },
      ],
    }),
    /Duplicate question id/,
  );
  assert.match(
    validateAssignmentDraft({
      instructions: 'ok',
      questions: [
        {
          id: 'a1',
          prompt: 'p',
          sections: [
            { id: 'a', instruction: 'x' },
            { id: 'a', instruction: 'y' },
          ],
        },
      ],
    }),
    /Duplicate section id/,
  );
});

test('validateAssignmentDraft returns empty string for a valid draft', () => {
  assert.equal(
    validateAssignmentDraft({
      instructions: 'ok',
      questions: [
        { id: 'a1', prompt: 'p', sections: [{ id: 'a', instruction: 'x' }] },
      ],
    }),
    '',
  );
});
