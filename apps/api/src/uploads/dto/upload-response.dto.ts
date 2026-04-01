import { ListingSuggestions } from '../image-analysis.service';

export interface UploadImageResponse {
  url: string;
  key: string;
  width: number;
  height: number;
  suggestions: ListingSuggestions;
}
