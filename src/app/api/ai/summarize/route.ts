import { NextRequest, NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: NextRequest) {
  try {
    const { snapshots } = await req.json();
    if (!snapshots || !Array.isArray(snapshots) || snapshots.length === 0) {
      return NextResponse.json({ success: false, message: 'Snapshots are required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Build a clean, structured log report based on version logs
      const totalVersions = snapshots.length;
      const contributors = Array.from(new Set(snapshots.map(s => s.createdBy)));
      const logs = snapshots
        .map(s => `- **v${s.version}** by *${s.createdBy}*: "${s.comment}" (${new Date(s.createdAt).toLocaleTimeString()})`)
        .join('\n');

      const mockSummary = `### 📊 Document Evolution Summary (System Log)

This document has undergone **${totalVersions} revisions** collaborated on by **${contributors.join(', ')}**.

#### Key Revisions Timeline:
${logs}

#### Progression Analysis:
*The document shows structured, sequential growth. It began with initialization drafts and transitioned towards finalized production copies.*`;

      return NextResponse.json({
        success: true,
        summary: mockSummary,
        isMock: true,
      });
    }

    const snapshotLogs = snapshots
      .map(s => `[v${s.version}] Contributor: ${s.createdBy}\nTime: ${s.createdAt}\nComment: ${s.comment}\nContent:\n"""\n${s.content}\n"""\n`)
      .join('\n---\n');

    const { text } = await generateText({
      model: google('gemini-1.5-flash'),
      system: 'You are an advanced documentation analyst. Examine the version snapshots, logs, and comments to provide a structured Markdown summary of how this document has evolved. Outline who added what, note key content alterations, and summarize the overall document progression in a professional tone.',
      prompt: `Analyze the following version snapshot logs:\n\n${snapshotLogs}`,
    });

    return NextResponse.json({
      success: true,
      summary: text,
    });
  } catch (err: any) {
    console.error('[Summarizer Error]:', err);
    return NextResponse.json({ success: false, message: 'Summarizer execution error', error: err.message }, { status: 500 });
  }
}
