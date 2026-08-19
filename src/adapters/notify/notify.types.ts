export interface NotifyCampaignRequest {
  name: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  recipientType: 'tags' | 'all' | 'list';
  recipientTags: string[];
  status: 'draft' | 'scheduled' | 'sending';
  scheduledAt: string;
  subject: string;
  html_content: string;
  type: string;
}

export interface NotifyCampaignResponse {
  id: string;
  status?: string;
  scheduledAt?: string;
  recipients?: number;
}
