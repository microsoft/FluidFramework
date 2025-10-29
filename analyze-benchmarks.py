#!/usr/bin/env python3
"""
Analyze and visualize Fluid Framework build cache benchmark results.

Usage:
    python3 analyze-benchmarks.py benchmark-results/results.json
    python3 analyze-benchmarks.py benchmark-results/*.json --compare
"""

import json
import sys
import argparse
from pathlib import Path
from typing import List, Dict, Any


def format_time(seconds: float) -> str:
    """Format seconds into human-readable string."""
    if seconds < 1:
        return f"{seconds * 1000:.1f}ms"
    elif seconds < 60:
        return f"{seconds:.2f}s"
    else:
        minutes = int(seconds // 60)
        secs = seconds % 60
        return f"{minutes}m {secs:.1f}s"


def calculate_speedup(cached_time: float, uncached_time: float) -> float:
    """Calculate speedup ratio."""
    return uncached_time / cached_time if cached_time > 0 else 0


def analyze_single_benchmark(filepath: Path) -> Dict[str, Any]:
    """Analyze a single benchmark JSON file."""
    with open(filepath, 'r') as f:
        data = json.load(f)
    
    results = {}
    
    for result in data['results']:
        name = result['command']
        results[name] = {
            'mean': result['mean'],
            'stddev': result['stddev'],
            'median': result['median'],
            'min': result['min'],
            'max': result['max'],
            'times': result.get('times', [])
        }
    
    return {
        'filepath': str(filepath),
        'results': results,
        'raw': data
    }


def print_single_analysis(analysis: Dict[str, Any]):
    """Print analysis of a single benchmark."""
    print(f"\n{'='*70}")
    print(f"Benchmark: {Path(analysis['filepath']).name}")
    print(f"{'='*70}\n")
    
    results = analysis['results']
    
    # Find cached and uncached results
    cached = None
    uncached = None
    
    for name, data in results.items():
        if 'without-cache' in name or 'cold' in name or 'full' in name:
            uncached = data
            uncached_name = name
        elif 'with-cache' in name or 'warm' in name or 'no-change' in name:
            cached = data
            cached_name = name
    
    # Print individual results
    for name, data in results.items():
        print(f"📊 {name}:")
        print(f"   Mean:   {format_time(data['mean'])} ± {format_time(data['stddev'])}")
        print(f"   Median: {format_time(data['median'])}")
        print(f"   Range:  {format_time(data['min'])} → {format_time(data['max'])}")
        print()
    
    # Calculate and print speedup if applicable
    if cached and uncached:
        speedup = calculate_speedup(cached['mean'], uncached['mean'])
        time_saved = uncached['mean'] - cached['mean']
        percent_saved = (time_saved / uncached['mean']) * 100
        
        print(f"{'─'*70}")
        print(f"⚡ Cache Performance:")
        print(f"   Speedup:     {speedup:.2f}x faster")
        print(f"   Time saved:  {format_time(time_saved)} ({percent_saved:.1f}%)")
        print(f"   Efficiency:  {'🟢 Excellent' if speedup > 3 else '🟡 Good' if speedup > 2 else '🟠 Moderate' if speedup > 1.5 else '🔴 Poor'}")
        print(f"{'─'*70}")


def compare_benchmarks(analyses: List[Dict[str, Any]]):
    """Compare multiple benchmarks."""
    print(f"\n{'='*70}")
    print(f"Benchmark Comparison")
    print(f"{'='*70}\n")
    
    comparison_data = []
    
    for analysis in analyses:
        results = analysis['results']
        cached = None
        uncached = None
        
        for name, data in results.items():
            if 'without-cache' in name or 'cold' in name:
                uncached = data
            elif 'with-cache' in name or 'warm' in name:
                cached = data
        
        if cached and uncached:
            speedup = calculate_speedup(cached['mean'], uncached['mean'])
            comparison_data.append({
                'file': Path(analysis['filepath']).stem,
                'cached': cached['mean'],
                'uncached': uncached['mean'],
                'speedup': speedup
            })
    
    # Sort by speedup
    comparison_data.sort(key=lambda x: x['speedup'], reverse=True)
    
    # Print table
    print(f"{'Project':<40} {'Cached':<12} {'Uncached':<12} {'Speedup':<10}")
    print(f"{'-'*40} {'-'*12} {'-'*12} {'-'*10}")
    
    for item in comparison_data:
        print(f"{item['file']:<40} {format_time(item['cached']):<12} "
              f"{format_time(item['uncached']):<12} {item['speedup']:.2f}x")
    
    print()
    
    # Calculate averages
    if comparison_data:
        avg_speedup = sum(x['speedup'] for x in comparison_data) / len(comparison_data)
        avg_cached = sum(x['cached'] for x in comparison_data) / len(comparison_data)
        avg_uncached = sum(x['uncached'] for x in comparison_data) / len(comparison_data)
        
        print(f"{'─'*70}")
        print(f"📈 Average Metrics:")
        print(f"   Avg cached time:   {format_time(avg_cached)}")
        print(f"   Avg uncached time: {format_time(avg_uncached)}")
        print(f"   Avg speedup:       {avg_speedup:.2f}x")
        print(f"{'─'*70}")


def create_visualization(analyses: List[Dict[str, Any]], output_file: str):
    """Create visualization using matplotlib (if available)."""
    try:
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        print("⚠️  matplotlib not available. Install with: pip install matplotlib")
        return
    
    data = []
    labels = []
    
    for analysis in analyses:
        results = analysis['results']
        cached = None
        uncached = None
        
        for name, result_data in results.items():
            if 'without-cache' in name:
                uncached = result_data['mean']
            elif 'with-cache' in name:
                cached = result_data['mean']
        
        if cached and uncached:
            labels.append(Path(analysis['filepath']).stem)
            data.append([cached, uncached])
    
    if not data:
        print("No comparison data available for visualization")
        return
    
    data = np.array(data)
    x = np.arange(len(labels))
    width = 0.35
    
    fig, ax = plt.subplots(figsize=(12, 6))
    
    bars1 = ax.bar(x - width/2, data[:, 0], width, label='With Cache', color='#2ecc71')
    bars2 = ax.bar(x + width/2, data[:, 1], width, label='Without Cache', color='#e74c3c')
    
    ax.set_xlabel('Project')
    ax.set_ylabel('Time (seconds)')
    ax.set_title('Build Cache Performance Comparison')
    ax.set_xticks(x)
    ax.set_xticklabels(labels, rotation=45, ha='right')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"\n📊 Visualization saved to: {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='Analyze Fluid Framework build cache benchmark results'
    )
    parser.add_argument(
        'files',
        nargs='+',
        help='Benchmark JSON file(s) to analyze'
    )
    parser.add_argument(
        '--compare',
        action='store_true',
        help='Compare multiple benchmarks'
    )
    parser.add_argument(
        '--visualize',
        metavar='OUTPUT',
        help='Create visualization (requires matplotlib)'
    )
    
    args = parser.parse_args()
    
    # Load and analyze benchmarks
    analyses = []
    for filepath_str in args.files:
        filepath = Path(filepath_str)
        if not filepath.exists():
            print(f"⚠️  File not found: {filepath}")
            continue
        
        try:
            analysis = analyze_single_benchmark(filepath)
            analyses.append(analysis)
            
            if not args.compare or len(args.files) == 1:
                print_single_analysis(analysis)
        except Exception as e:
            print(f"❌ Error analyzing {filepath}: {e}")
    
    # Compare if requested
    if args.compare and len(analyses) > 1:
        compare_benchmarks(analyses)
    
    # Visualize if requested
    if args.visualize and analyses:
        create_visualization(analyses, args.visualize)


if __name__ == '__main__':
    main()
