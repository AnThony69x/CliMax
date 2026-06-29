<?php

namespace App\Services;

class ContentModerationService
{
    /**
     * Free-first moderation: deterministic rules produce a transparent score
     * and every new community item still starts pending human review.
     *
     * @return array{score:int,decision:string,labels:array<int,string>,reasons:array<int,string>}
     */
    public function analyzeText(string $content, bool $hasImage = false): array
    {
        $normalized = $this->normalize($content);
        $score = 0;
        $labels = [];
        $reasons = [];

        $checks = [
            'threat' => [
                'score' => 80,
                'reason' => 'Amenaza o violencia detectada.',
                'patterns' => ['matar', 'muerte', 'te voy a', 'golpear', 'bomba', 'arma'],
            ],
            'abuse' => [
                'score' => 35,
                'reason' => 'Lenguaje ofensivo detectado.',
                'patterns' => ['idiota', 'imbecil', 'pendejo', 'estupido', 'basura', 'maldito'],
            ],
            'sexual' => [
                'score' => 70,
                'reason' => 'Contenido sexual explicito detectado.',
                'patterns' => ['sexo', 'porno', 'desnudo', 'xxx'],
            ],
            'scam' => [
                'score' => 45,
                'reason' => 'Posible estafa o promocion sospechosa.',
                'patterns' => ['gana dinero', 'inversion garantizada', 'cripto gratis', 'whatsapp +', 'premio'],
            ],
            'spam' => [
                'score' => 30,
                'reason' => 'Patron de spam detectado.',
                'patterns' => ['http://', 'https://', 'www.', 'bit.ly', 't.me/'],
            ],
        ];

        foreach ($checks as $label => $check) {
            foreach ($check['patterns'] as $pattern) {
                if (str_contains($normalized, $pattern)) {
                    $score += $check['score'];
                    $labels[] = $label;
                    $reasons[] = $check['reason'];
                    break;
                }
            }
        }

        if (preg_match('/\b\d{10,}\b/', $normalized) === 1 || preg_match('/[\w\.\-]+@[\w\.\-]+\.\w+/', $normalized) === 1) {
            $score += 25;
            $labels[] = 'personal_data';
            $reasons[] = 'Posibles datos personales detectados.';
        }

        if ($hasImage) {
            $score += 15;
            $labels[] = 'image_pending_manual_review';
            $reasons[] = 'Las imagenes requieren revision manual.';
        }

        if (trim($content) === '' || mb_strlen(trim($content)) < 6) {
            $score += 20;
            $labels[] = 'low_context';
            $reasons[] = 'Contenido demasiado corto o sin contexto.';
        }

        $score = min(100, $score);
        $labels = array_values(array_unique($labels));
        $reasons = array_values(array_unique($reasons));

        return [
            'score' => $score,
            'decision' => $score >= 85 ? 'rejected' : 'pending_review',
            'labels' => $labels,
            'reasons' => $reasons,
        ];
    }

    private function normalize(string $value): string
    {
        $lower = mb_strtolower($value);
        $plain = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $lower);

        return preg_replace('/\s+/', ' ', $plain ?: $lower) ?? $lower;
    }
}
