import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Starting or reusing a 1:1 conversation is keyed on the participant
 * pair (Conversation.@@unique([participant1Id, participant2Id])), so
 * the client MUST supply the other participant's user id. Without
 * this DTO the controller accepted `{ otherUserId: undefined }` and
 * the service call resolved an undefined-keyed pair — a silent
 * dead-end. Stale mobile binaries that still post the legacy
 * `{ listingId, message }` shape now get a clean 400 instead of a
 * broken conversation row.
 */
export class StartConversationDto {
  @ApiProperty({
    description: 'ID do outro participante (usuário com quem iniciar a conversa).',
  })
  @IsString()
  @IsNotEmpty({ message: 'otherUserId é obrigatório.' })
  @Length(1, 128)
  otherUserId!: string;
}
