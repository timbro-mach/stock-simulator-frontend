const toTextValue = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => toTextValue(entry)).filter(Boolean).join('\n\n');
  }
  if (value && typeof value === 'object') {
    return value?.text || value?.content || value?.body || value?.value || '';
  }
  return '';
};

const getContentQuestions = (content) => {
  if (Array.isArray(content?.questions)) return content.questions;
  if (Array.isArray(content?.prompts)) return content.prompts;
  if (Array.isArray(content?.assignmentPrompts)) return content.assignmentPrompts;
  if (Array.isArray(content?.assignment_prompts)) return content.assignment_prompts;
  if (content?.questions && typeof content.questions === 'object') {
    return Object.values(content.questions);
  }
  return [];
};

const getQuestionSections = (question) => {
  if (Array.isArray(question?.sections)) return question.sections;
  if (Array.isArray(question?.parts)) return question.parts;
  return [];
};

export const mapQuestionsForEditor = (questions) => (
  (Array.isArray(questions) ? questions : []).map((question, questionIndex) => {
    const rawId = question?.id || question?.questionId;
    const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : `a${questionIndex + 1}`;
    const prompt = question?.prompt || question?.question || question?.text || '';
    const sections = getQuestionSections(question).map((section, sectionIndex) => {
      const rawSectionId = section?.id || section?.partId;
      const sectionId = typeof rawSectionId === 'string' && rawSectionId.trim()
        ? rawSectionId.trim()
        : String.fromCharCode(97 + sectionIndex);
      const instruction = section?.instruction || section?.prompt || section?.text || '';
      return { id: sectionId, instruction, existing: true };
    });
    const pointsNumber = Number(question?.points);
    const kindValue = typeof question?.kind === 'string' ? question.kind.trim() : '';
    return {
      id,
      prompt,
      sections,
      points: Number.isFinite(pointsNumber) ? pointsNumber : null,
      kind: kindValue,
      existing: true,
    };
  })
);

export const mapRubricHintsForEditor = (content) => {
  const source = Array.isArray(content?.rubricHints)
    ? content.rubricHints
    : (Array.isArray(content?.rubric_hints) ? content.rubric_hints : []);
  return source
    .map((hint) => (typeof hint === 'string' ? hint : toTextValue(hint)))
    .filter((hint) => hint !== undefined && hint !== null);
};

export const buildInitialAssignmentDraft = (content) => ({
  instructions: typeof content?.instructions === 'string' ? content.instructions : toTextValue(content?.instructions),
  questions: mapQuestionsForEditor(getContentQuestions(content)),
  rubricHints: mapRubricHintsForEditor(content),
});

export const nextQuestionId = (existingQuestions) => {
  const used = new Set((existingQuestions || []).map((question) => question?.id).filter(Boolean));
  let maxSeq = 0;
  used.forEach((id) => {
    const match = /^a(\d+)$/.exec(String(id));
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > maxSeq) maxSeq = parsed;
    }
  });
  let candidate = `a${maxSeq + 1}`;
  while (used.has(candidate)) {
    maxSeq += 1;
    candidate = `a${maxSeq + 1}`;
  }
  return candidate;
};

export const nextSectionId = (existingSections) => {
  const used = new Set((existingSections || []).map((section) => section?.id).filter(Boolean));
  for (let i = 0; i < 26; i += 1) {
    const candidate = String.fromCharCode(97 + i);
    if (!used.has(candidate)) return candidate;
  }
  let suffix = 1;
  while (used.has(`s${suffix}`)) suffix += 1;
  return `s${suffix}`;
};

export const buildAssignmentPayloadContent = (draft) => {
  const instructions = String(draft?.instructions ?? '').trim();
  const questions = (draft?.questions || []).map((question) => {
    const sections = (question.sections || []).map((section) => ({
      id: section.id,
      instruction: String(section.instruction ?? '').trim(),
    }));
    const payload = {
      id: question.id,
      prompt: String(question.prompt ?? '').trim(),
      sections,
    };
    if (question.points !== null && question.points !== undefined && question.points !== '') {
      const pointsNumber = Number(question.points);
      if (Number.isFinite(pointsNumber)) payload.points = pointsNumber;
    }
    if (typeof question.kind === 'string' && question.kind.trim()) {
      payload.kind = question.kind.trim();
    }
    return payload;
  });
  const rubricHints = (draft?.rubricHints || [])
    .map((hint) => String(hint ?? '').trim())
    .filter((hint) => hint.length > 0);
  const content = { instructions, questions };
  if (rubricHints.length > 0) content.rubricHints = rubricHints;
  return content;
};

export const validateAssignmentDraft = (draft) => {
  if (!draft) return 'Missing assignment content.';
  if (!String(draft.instructions ?? '').trim()) return 'Instructions cannot be empty.';
  if (!Array.isArray(draft.questions) || draft.questions.length === 0) return 'At least one question is required.';
  const seenIds = new Set();
  for (let i = 0; i < draft.questions.length; i += 1) {
    const question = draft.questions[i];
    if (!question?.id || !String(question.id).trim()) return `Question ${i + 1} is missing an id.`;
    if (seenIds.has(question.id)) return `Duplicate question id: ${question.id}.`;
    seenIds.add(question.id);
    if (!String(question.prompt ?? '').trim()) return `Question ${question.id} prompt cannot be empty.`;
    const sectionIds = new Set();
    for (let j = 0; j < (question.sections || []).length; j += 1) {
      const section = question.sections[j];
      if (!section?.id || !String(section.id).trim()) return `Question ${question.id} has a section missing an id.`;
      if (sectionIds.has(section.id)) return `Duplicate section id in question ${question.id}: ${section.id}.`;
      sectionIds.add(section.id);
      if (!String(section.instruction ?? '').trim()) return `Section ${section.id} of question ${question.id} cannot be empty.`;
    }
  }
  return '';
};
