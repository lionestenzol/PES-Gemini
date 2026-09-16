import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

export function getAiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function askUniversalAgent(
  message: string,
  history: ChatMessage[] = [],
  contextData?: any
): Promise<string> {
  const ai = getAiClient();

  const systemInstruction = `You are the Universal PES Agent, an intelligent orchestration and execution assistant for the Personal Execution System (PES) and PES V2 Transformation Architecture.
The system is built on these foundational components:
1. DropList: A zero-friction cognitive holding bay where the operator dumps thoughts, sparks, ideas, voice notes, and needs to clear their working memory.
2. The Line: An AI-assisted sorting, prioritization, and orchestration bin that organizes dropped items into sequenced work ready for commitment.
3. PES V2 Engine: The heavy 4-compartment transformation compiler that turns complex intents into verified reality (Intake -> Has/Wants Delta -> Knowledge & Resources -> Tree & BPMN Decomposition -> Middle Box Execution -> Proof Gate -> Terminal JSON).
4. The Stuck Feature: An AI diagnostic and reroute mechanism for when an operator or ticket encounters friction, failure, or cognitive blockages.
5. Separation of Duties & Hardened Middle Box: AI plans, but deterministic execution runs in the Middle Box with proof-backed verification.

Your tone is sharp, objective, helpful, clear, and proactive. You help the user triage ideas, structure messy prompts into V2 inputs, unblock work, plan capacity, and execute reliably.
Current System Context: ${contextData ? JSON.stringify(contextData) : 'No active context provided'}`;

  if (!ai) {
    // Intelligent local fallback when GEMINI_API_KEY is not yet attached in Secrets
    return generateFallbackAgentResponse(message, contextData);
  }

  try {
    const formattedContents = [
      ...history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text || 'I analyzed your request, but no response text was returned.';
  } catch (error: any) {
    console.error('[PES Agent] Gemini API call error:', error);
    return `[PES Agent Notice]: Encountered error calling Gemini API (${error.message || error}). Falling back to local reasoning: ${generateFallbackAgentResponse(message, contextData)}`;
  }
}

export async function sortTheLineWithAi(
  items: Array<{ id: string | number; text: string; category?: string; created_at?: string }>,
  customPrompt?: string
): Promise<{
  summary: string;
  sortedItems: Array<{
    id: string | number;
    text: string;
    actionType: 'promote_v2' | 'quick_task' | 'incubate' | 'the_line';
    priorityScore: number;
    reasoning: string;
    suggestedTags: string[];
  }>;
}> {
  const ai = getAiClient();

  if (!ai || items.length === 0) {
    // Deterministic fallback sorting
    const fallbackSorted = items.map((item, idx) => ({
      id: item.id,
      text: item.text,
      actionType:
        item.text.length > 50 || item.text.toLowerCase().includes('architect') || item.text.toLowerCase().includes('migrate')
          ? ('promote_v2' as const)
          : ('the_line' as const),
      priorityScore: 90 - idx * 10,
      reasoning: 'Sorted by heuristic relevance and complexity assessment.',
      suggestedTags: ['#Triaged', '#TheLine'],
    }));

    return {
      summary: `Sorted ${items.length} items from DropList into The Line using local heuristic triage.`,
      sortedItems: fallbackSorted,
    };
  }

  try {
    const prompt = `Analyze these dropped items from the user's DropList and orchestrate them into "The Line" for execution planning:
${JSON.stringify(items, null, 2)}

User request/custom instructions: ${customPrompt || 'Sort and prioritize for immediate execution'}

Return a valid JSON object matching this schema:
{
  "summary": "Brief executive summary of the batch triage and sequence recommendations",
  "sortedItems": [
    {
      "id": "original item id",
      "text": "original text",
      "actionType": "promote_v2" | "quick_task" | "incubate" | "the_line",
      "priorityScore": 1-100,
      "reasoning": "why it belongs here",
      "suggestedTags": ["#tag1", "#tag2"]
    }
  ]
}
IMPORTANT: Return ONLY raw valid JSON, no markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return parsed;
  } catch (error: any) {
    console.error('[The Line] Gemini API sorting error:', error);
    return {
      summary: 'Local fallback sorting applied due to model communication timeout.',
      sortedItems: items.map((item, idx) => ({
        id: item.id,
        text: item.text,
        actionType: 'the_line',
        priorityScore: 80 - idx * 5,
        reasoning: 'Fallback queue position assigned.',
        suggestedTags: ['#TheLine'],
      })),
    };
  }
}

export async function diagnoseAndRerouteStuck(
  blockerDescription: string,
  currentContext?: any
): Promise<{
  rootCauseAnalysis: string;
  blockerType: 'cognitive_overload' | 'missing_resource' | 'dependency_deadlock' | 'unclear_spec' | 'technical_failure';
  immediateNextSteps: string[];
  reroutePlan: {
    target: 'DropList' | 'TheLine' | 'V2_Engine' | 'Breakdown_Checklist';
    actionTitle: string;
    actionDetails: string;
  };
}> {
  const ai = getAiClient();

  if (!ai) {
    return {
      rootCauseAnalysis:
        'Friction detected in the execution flow. The current task has unresolved prerequisite dependencies or high cognitive ambiguity.',
      blockerType: 'cognitive_overload',
      immediateNextSteps: [
        'Decompose the current task into 3 atomic 5-minute sub-actions.',
        'Offload secondary concerns back into DropList so you can focus on a single active thread.',
        'Verify tool/credential affordances in Compartment 2 of PES V2.',
      ],
      reroutePlan: {
        target: 'TheLine',
        actionTitle: 'Step-down atomic slice',
        actionDetails:
          'Isolate the simplest reproducible milestone, demote the blocking task to The Line, and execute the isolated leaf first.',
      },
    };
  }

  try {
    const prompt = `The operator is STUCK on an execution task.
Blocker Description: "${blockerDescription}"
Current Context: ${JSON.stringify(currentContext || {})}

Analyze the impediment, diagnose the underlying failure mode, provide 3 immediate unblocking steps, and produce a concrete reroute plan.
Return a valid JSON object matching this schema:
{
  "rootCauseAnalysis": "Clear 2-sentence breakdown of why this is blocked",
  "blockerType": "cognitive_overload" | "missing_resource" | "dependency_deadlock" | "unclear_spec" | "technical_failure",
  "immediateNextSteps": ["step 1", "step 2", "step 3"],
  "reroutePlan": {
    "target": "DropList" | "TheLine" | "V2_Engine" | "Breakdown_Checklist",
    "actionTitle": "Specific title of the reroute action",
    "actionDetails": "Specific instruction on how to resume execution"
  }
}
IMPORTANT: Return ONLY raw JSON, without markdown ticks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (err: any) {
    console.error('[The Stuck Feature] Gemini API error:', err);
    return {
      rootCauseAnalysis: 'Execution bottleneck encountered. Analyzing constraints locally.',
      blockerType: 'dependency_deadlock',
      immediateNextSteps: [
        'Capture the exact error stdout/stderr or friction point in DropList.',
        'Reroute to The Line for priority re-evaluation.',
        'Promote an unblocked parallel branch in the V2 Dependency Graph.',
      ],
      reroutePlan: {
        target: 'TheLine',
        actionTitle: 'Queue Pivot',
        actionDetails: 'Switch to next ready task while diagnosing dependency deadlock.',
      },
    };
  }
}

function generateFallbackAgentResponse(message: string, contextData?: any): string {
  const lower = message.toLowerCase();
  if (lower.includes('droplist') || lower.includes('drop')) {
    return `DropList is your primary cognitive offload bay. Whenever a thought, spark, voice memo, or blocker emerges, drop it directly into DropList. From there, we can sort it into "The Line" or compile it directly through the PES V2 transformation pipeline.`;
  }
  if (lower.includes('stuck') || lower.includes('blocked') || lower.includes('help')) {
    return `When you're stuck, remember: don't spin your wheels. Open "The Stuck Feature", share the specific friction point, and I will diagnose whether it's a cognitive overload, a missing affordance, or a dependency deadlock, and generate an immediate pivot plan.`;
  }
  if (lower.includes('line') || lower.includes('sort') || lower.includes('plan')) {
    return `"The Line" is your orchestration staging area. It takes raw items from DropList, runs an AI prioritization pass, and stages them for either rapid completion or full PES V2 macro-compilation.`;
  }
  if (lower.includes('v2') || lower.includes('tree') || lower.includes('bpmn')) {
    return `PES V2 is ready. We have the full 4 compartments active, including the Visual Node Tree and the Visual BPMN 2.0 diagram. Would you like me to take a dropped item and run it through Signal Extraction and Has vs. Wants Delta?`;
  }
  return `I am your Universal PES Agent. I can help you triage raw ideas from DropList, sequence "The Line", compile complex projects through PES V2 (Tree & BPMN), or unblock you using "The Stuck Feature". What would you like to focus on right now?`;
}
