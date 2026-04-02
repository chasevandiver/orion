export { LinkedInPreview } from "./LinkedInPreview";
export { TwitterPreview } from "./TwitterPreview";
export { InstagramPreview } from "./InstagramPreview";
export { FacebookPreview } from "./FacebookPreview";
export { EmailPreview } from "./EmailPreview";

export type PlatformPreviewProps = {
  content: string;
  brandName: string;
  brandLogo?: string;
  image?: string;
  channel: string;
};
