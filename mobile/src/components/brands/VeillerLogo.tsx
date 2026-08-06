import Svg, {Path, SvgProps} from "react-native-svg"
import {useAppTheme} from "@/contexts/ThemeContext"

interface LogoProps extends SvgProps {
  width?: number
  height?: number
  fill?: string
  colorOverride?: string
}

export const VeillerLogo: React.FC<LogoProps> = ({width = 24, height = 24, colorOverride}) => {
  const {theme} = useAppTheme()
  const isDark = theme.isDark
  const color = colorOverride || (isDark ? "#4FE98D" : "#00B869")
  return (
    <Svg width={width} height={height} viewBox="106 106 300 304" fill="none">
      <Path
        d="M 150 150 L 256 366 L 362 150"
        stroke={color}
        strokeWidth={74}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}
