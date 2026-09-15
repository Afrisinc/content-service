import { registerAiVideoHandlers } from './aiVideo.handler';
import { registerAnimationHandlers } from './animation.handler';
import { registerAssetHandlers } from './asset.handler';
import { registerAudioHandlers } from './audio.handler';
import { registerPublishHandlers } from './publish.handler';
import { registerQualityHandlers } from './quality.handler';
import { registerStoryHandlers } from './story.handler';

export function registerStudioHandlers(): void {
  registerStoryHandlers();
  registerAssetHandlers();
  registerAudioHandlers();
  registerAnimationHandlers();
  registerAiVideoHandlers();
  registerQualityHandlers();
  registerPublishHandlers();
}

export {
  registerAiVideoHandlers,
  registerStoryHandlers,
  registerAssetHandlers,
  registerAudioHandlers,
  registerAnimationHandlers,
  registerQualityHandlers,
  registerPublishHandlers,
};
