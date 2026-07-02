import React, { useEffect, useRef, useState } from 'react';
import { Text, Animated } from 'react-native';

// Counts up from 0 to `value` over `duration` ms. Pass a `formatter` to
// render currency/percent strings instead of a raw integer.
export default function AnimatedNumber({ value, duration = 900, style, formatter, prefix = '', suffix = '' }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);
  const numeric = Number(value) || 0;

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(anim, { toValue: numeric, duration, useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [numeric]);

  const text = formatter ? formatter(display) : `${prefix}${display.toLocaleString('en-IN')}${suffix}`;
  return <Text style={style}>{text}</Text>;
}
