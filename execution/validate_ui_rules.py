#!/usr/bin/env python3
import os
import sys
import re
import argparse

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

RED = '\033[91m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
BOLD = '\033[1m'
RESET = '\033[0m'

RE_ROUNDED_FULL = re.compile(r'\b(rounded-full)\b')
RE_ROUNDED_3XL = re.compile(r'\b(rounded-3xl)\b')
RE_ROUNDED_ARBITRARY = re.compile(r'\b(rounded-\[[^\]]+\])\b')

RE_SPACING_CLASSES = re.compile(
    r'\b((?:p|m|gap|space-[xy])(?:[xytblr])?)-(\d+(?:\.\d+)?|\[[^\]]+\])\b'
)

RECOMMENDED_SPACING_UNITS = {
    0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 72, 80, 96
}

def check_file(file_path):
    violations = []
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        
    for line_num, line in enumerate(lines, start=1):
        # 1. Validar Border Radius
        if 'rounded-full' in line:
            is_container = False
            for container in ['<div', '<section', '<article', '<main', '<aside', '<header', '<footer', '<form']:
                if container in line.lower():
                    if 'animate-spin' in line.lower() or 'spinner' in line.lower() or 'loader' in line.lower() or 'avatar' in line.lower() or 'badge' in line.lower() or 'indicator' in line.lower() or 'pulse' in line.lower():
                        continue
                    is_container = True
                    break
            
            if is_container:
                violations.append({
                    'line': line_num,
                    'rule': 'Border Radius',
                    'severity': 'WARNING',
                    'content': 'Uso de "rounded-full" em container estrutural.',
                    'suggestion': 'Troque por "rounded-xl" ou "rounded-lg" para manter um design premium e clean.'
                })
        
        if 'rounded-3xl' in line:
            violations.append({
                'line': line_num,
                'rule': 'Border Radius',
                'severity': 'WARNING',
                'content': 'Uso de "rounded-3xl" detectado.',
                'suggestion': 'Evite cantos exageradamente arredondados. De preferencia a "rounded-xl" ou "rounded-lg".'
            })
            
        arbitrary_matches = RE_ROUNDED_ARBITRARY.findall(line)
        for match in arbitrary_matches:
            if '999' in match or '99' in match:
                violations.append({
                    'line': line_num,
                    'rule': 'Border Radius',
                    'severity': 'WARNING',
                    'content': f'Uso de valor arbitrario excessivo: "{match}".',
                    'suggestion': 'Use rounded-full se for um botao capsula/tag, ou classes de escala recomendada (rounded-xl).'
                })
                
        # 2. Validar Escala de Espaçamento
        spacing_matches = RE_SPACING_CLASSES.findall(line)
        for prefix, value in spacing_matches:
            if value.startswith('[') and value.endswith(']'):
                continue
            
            try:
                val_num = float(value)
                if val_num > 4 and val_num not in RECOMMENDED_SPACING_UNITS:
                    violations.append({
                        'line': line_num,
                        'rule': 'Espacamento',
                        'severity': 'INFO',
                        'content': f'Classe "{prefix}-{value}" fora da escala de espacamento recomendada (escala de 4px).',
                        'suggestion': f'Substitua por um valor proximo recomendado (ex: {int(val_num - (val_num % 2)) if val_num % 2 != 0 else int(val_num)}).'
                    })
            except ValueError:
                pass
                
    return violations

def main():
    parser = argparse.ArgumentParser(description='Validador de Diretrizes de UI/UX para CSS/Tailwind.')
    parser.add_argument('paths', nargs='*', help='Arquivos ou diretorios para validar.')
    parser.add_argument('--strict', action='store_true', help='Tratar avisos como erros impeditivos de build.')
    
    args = parser.parse_args()
    
    if not args.paths:
        paths_to_scan = []
        for root, dirs, files in os.walk('src'):
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'dist', 'build', '.git')]
            for file in files:
                if file.endswith(('.tsx', '.jsx', '.ts', '.js', '.html', '.css')):
                    paths_to_scan.append(os.path.join(root, file))
    else:
        paths_to_scan = []
        for path in args.paths:
            if os.path.isdir(path):
                for root, dirs, files in os.walk(path):
                    dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'dist', 'build', '.git')]
                    for file in files:
                        if file.endswith(('.tsx', '.jsx', '.ts', '.js', '.html', '.css')):
                            paths_to_scan.append(os.path.join(root, file))
            elif os.path.isfile(path):
                paths_to_scan.append(path)
                
    total_violations = 0
    has_errors = False
    
    print(f"\n{BOLD}{BLUE}=== INICIANDO VALIDACAO DE DIRETRIZES DE UI/UX (LINKZIVO) ==={RESET}\n")
    print(f"Escaneando {len(paths_to_scan)} arquivos...\n")
    
    for file_path in paths_to_scan:
        violations = check_file(file_path)
        if violations:
            print(f"{BOLD}{YELLOW}Arquivo: {file_path}{RESET}")
            for v in violations:
                color = RED if v['severity'] == 'WARNING' else YELLOW
                prefix = f"[{v['severity']}]"
                print(f"  {BOLD}Linha {v['line']}:{RESET} {color}{prefix} {v['rule']} - {v['content']}{RESET}")
                print(f"    {BOLD}Sugestao:{RESET} {v['suggestion']}")
                total_violations += 1
                if v['severity'] == 'WARNING':
                    has_errors = True
            print()
            
    print(f"{BOLD}=== RESUMO DA VALIDACAO ==={RESET}")
    if total_violations == 0:
        print(f"{GREEN}[OK] Nenhum desvio de UI/UX encontrado! Layout perfeitamente clean e moderno.{RESET}\n")
        sys.exit(0)
    else:
        print(f"{YELLOW}[WARN] Total de desvios encontrados: {total_violations}{RESET}")
        if has_errors and args.strict:
            print(f"{RED}[ERR] Validacao falhou devido a violacoes graves em modo estrito (--strict).{RESET}\n")
            sys.exit(1)
        else:
            print(f"{GREEN}[OK] Escaneamento concluido com avisos. Ajuste conforme necessario.{RESET}\n")
            sys.exit(0)

if __name__ == '__main__':
    main()
