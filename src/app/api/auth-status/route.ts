import { videoConfig, videoSecondsOptions } from '@/lib/video';
import { NextResponse } from 'next/server';

export async function GET() {
    const video = videoConfig();
    return NextResponse.json({
        passwordRequired: !!process.env.APP_PASSWORD,
        // Null when video is not set up; the UI then hides it.
        video: video ? { seconds: video.seconds, secondsOptions: videoSecondsOptions(video) } : null
    });
}
