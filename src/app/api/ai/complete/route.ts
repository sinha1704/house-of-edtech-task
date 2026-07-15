import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ success: false, message: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Mock autocomplete to ensure application behaves flawlessly
      const mockCompletions = [
        " In addition, we must ensure that all components are fully tested under offline scenarios.",
        " Furthermore, integrating IndexedDB allows client-side transactions to succeed without internet.",
        " This will significantly improve application speed and eliminate interface delay.",
        " By prioritizing local writes, we secure data durability before synchronization.",
      ];
      const randomCompletion = mockCompletions[Math.floor(Math.random() * mockCompletions.length)];
      return NextResponse.json({
        success: true,
        text: randomCompletion,
        isMock: true,
      });
    }

    // Retrieve text suggestions from the text provider service
    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      system: 'You are an elite co-writer. Write a short, highly contextual completion for the provided document section. Output ONLY the completion text (1 to 2 sentences max) that directly flows from the input prompt. Do not wrap in quotes or formatting.',
      prompt: prompt,
    });

    return NextResponse.json({
      success: true,
      text: text,
    });
  } catch (err: any) {
    console.error('[Autocomplete Error]:', err);
    return NextResponse.json({ success: false, message: 'Autocomplete execution error', error: err.message }, { status: 500 });
  }
}
