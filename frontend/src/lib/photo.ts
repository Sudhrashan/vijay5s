/** nginx caps request bodies at about 15 MB; reject bigger photos before uploading. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const PHOTO_TOO_LARGE = "Photo is too large — retake it at a lower resolution.";

export const isPhotoTooLarge = (f: File) => f.size > MAX_PHOTO_BYTES;
